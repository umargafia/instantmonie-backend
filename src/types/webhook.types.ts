export interface PaymentNotificationDto {
  orderNo: string;
  orderStatus: number;
  createdTime: string;
  updateTime: string;
  currency: string;
  orderAmount: number;
  reference: string;
  payerAccountNo: string;
  payerAccountName: string;
  payerBankName: string;
  virtualAccountNo: string;
  virtualAccountName: string;
  accountReference: string;
  sessionId: string;
  appId: string;
  sign: string;
}
