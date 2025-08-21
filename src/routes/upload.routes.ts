import express from 'express';
import { uploadVideo, uploadImage } from '../controllers/upload.controller';
import multer from 'multer';

const router = express.Router();
const upload = multer({ dest: 'temp/' });

// Video upload route
router.post('/video', upload.single('video'), uploadVideo);

// Image upload route
router.post('/image', upload.single('image'), uploadImage);

export default router;
