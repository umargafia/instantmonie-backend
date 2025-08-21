const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');
const axios = require('axios');

const app = express();
app.use(express.json());

// MongoDB connection
mongoose
  .connect('mongodb://localhost:27017/palmpay', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => console.error('MongoDB connection error:', err));

// Business Schema
const businessSchema = new mongoose.Schema({
  virtualAccountNo: { type: String, required: true, unique: true },
  balance: { type: Number, default: 0 }, // Balance in NGN
  webhookUrl: { type: String, required: true },
});
const Business = mongoose.model('Business', businessSchema);

// Transaction Schema
const transactionSchema = new mongoose.Schema({
  orderNo: { type: String, required: true, unique: true },
  orderStatus: { type: Number, required: true },
  orderAmount: { type: Number, required: true }, // Stored in NGN
  virtualAccountNo: { type: String, required: true },
  payerAccountNo: { type: String, required: true },
  payerAccountName: { type: String, required: true },
  payerBankName: { type: String, required: true },
  virtualAccountName: { type: String },
  accountReference: { type: String },
  sessionId: { type: String },
  currency: { type: String, required: true },
  createdTime: { type: Number, required: true },
  updateTime: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now },
});
const Transaction = mongoose.model('Transaction', transactionSchema);

// PalmPay's public key (replace with actual public key provided by PalmPay)
const PALMPAY_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
<Your_PalmPay_Public_Key_Here>
-----END PUBLIC KEY-----`;

// Webhook endpoint for PalmPay notifications
app.post('/webhook/payin', async (req, res) => {
  try {
    const payload = req.body;
    const signature = payload.sign;

    // Verify RSA signature
    if (!verifySignature(payload, signature)) {
      console.error('Invalid signature');
      return res.status(400).send('Invalid signature');
    }

    // Extract relevant fields
    const {
      orderNo,
      orderStatus,
      orderAmount,
      virtualAccountNo,
      payerAccountNo,
      payerAccountName,
      payerBankName,
      virtualAccountName,
      accountReference,
      sessionId,
      currency,
      createdTime,
      updateTime,
    } = payload;

    // Check if order is successful (status 1)
    if (orderStatus !== 1) {
      console.log(`Order ${orderNo} not successful, status: ${orderStatus}`);
      return res.status(200).send('success'); // Avoid retries
    }

    // Check for duplicate transaction
    const existingTransaction = await Transaction.findOne({ orderNo });
    if (existingTransaction) {
      console.log(`Duplicate transaction detected for orderNo: ${orderNo}`);
      return res.status(200).send('success'); // Avoid retries
    }

    // Find business by virtual account number
    const business = await Business.findOne({ virtualAccountNo });
    if (!business) {
      console.error(`Business not found for virtual account: ${virtualAccountNo}`);
      return res.status(200).send('success'); // Avoid retries
    }

    // Create new transaction
    const amountNGN = orderAmount / 100; // Convert cents to NGN
    const transaction = new Transaction({
      orderNo,
      orderStatus,
      orderAmount: amountNGN,
      virtualAccountNo,
      payerAccountNo,
      payerAccountName,
      payerBankName,
      virtualAccountName,
      accountReference,
      sessionId,
      currency,
      createdTime,
      updateTime,
    });
    await transaction.save();
    console.log(`Transaction saved for orderNo: ${orderNo}`);

    // Update business balance
    business.balance += amountNGN;
    await business.save();
    console.log(`Updated balance for ${virtualAccountNo}: ${business.balance} NGN`);

    // Forward notification to business webhook
    try {
      await axios.post(business.webhookUrl, payload, {
        headers: { 'Content-Type': 'application/json' },
      });
      console.log(`Notification sent to ${business.webhookUrl} for order ${orderNo}`);
    } catch (error) {
      console.error(`Failed to send to ${business.webhookUrl}:`, error.message);
      // Log error but don't fail the response to PalmPay
    }

    // Return required response to PalmPay
    return res.status(200).send('success');
  } catch (error) {
    console.error('Webhook error:', error.message);
    return res.status(200).send('success'); // Avoid retries even on error
  }
});

// RSA signature verification
function verifySignature(payload, signature) {
  try {
    // Remove 'sign' from payload and sort keys
    const payloadWithoutSign = { ...payload };
    delete payloadWithoutSign.sign;
    const sortedPayload = JSON.stringify(payloadWithoutSign, null, 0);

    // Verify signature using RSA
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(sortedPayload);
    return verifier.verify(PALMPAY_PUBLIC_KEY, signature, 'base64');
  } catch (error) {
    console.error('Signature verification error:', error.message);
    return false;
  }
}

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
