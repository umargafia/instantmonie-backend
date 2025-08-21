import multer from 'multer';
import { Request, Response, NextFunction } from 'express';
import path from 'path';
import axios from 'axios';
import fs from 'fs';
import { promisify } from 'util';
import { catchAsync } from '@/utils/catchAsync';
import { AppError } from '@/utils/AppError';

// Add type definitions for multer
declare global {
  namespace Express {
    interface Request {
      file?: Express.Multer.File;
    }
  }
}

const upload = multer({ dest: 'temp/' });

const BUNNY_API_KEY = process.env.BUNNY_API_KEY || '8c28bfae-3314-42e4-a07b491bd639-cd39-4ed9';
const BUNNY_STORAGE_API_KEY = 'f9e1c1b7-9ee9-49a2-96ca1b05d623-b1de-41af';
const VIDEO_LIBRARY_ID = process.env.VIDEO_LIBRARY_ID || '411576';
const CDN_HOSTNAME = process.env.CDN_HOSTNAME || 'vz-df70273d-cd9.b-cdn.net';
const BUNNY_STORAGE_ZONE = 'sabikukmedia';
const BUNNY_STORAGE_REGION = 'de';
const BUNNY_STORAGE_HOST = `https://storage.bunnycdn.com/${BUNNY_STORAGE_ZONE}`;

// Constants
const MAX_FILE_SIZE = 1024 * 1024 * 1024; // 1GB
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/x-msvideo'];
const PROGRESS_UPDATE_INTERVAL = 1000; // 1 second

// Types
interface UploadProgress {
  progress: number;
  status: 'uploading' | 'processing' | 'completed' | 'error';
  message?: string;
}

interface VideoUploadResponse {
  videoId: string;
  url: string;
  coverImage: string;
}

// Helper functions
const validateFile = (file: Express.Multer.File | undefined): void => {
  if (!file) {
    throw new AppError('No video file provided', 400);
  }

  if (!ALLOWED_VIDEO_TYPES.includes(file.mimetype)) {
    throw new AppError('Invalid file type. Only video files are allowed.', 400);
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new AppError('File size exceeds maximum limit of 1GB', 400);
  }
};

const cleanupTempFile = async (filePath: string): Promise<void> => {
  try {
    await promisify(fs.unlink)(filePath);
  } catch (error) {
    console.error(`Failed to cleanup temp file: ${filePath}`, error);
  }
};

export const uploadVideo = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  const file = req.file;
  let tempFilePath: string | null = null;

  try {
    // Validate file
    validateFile(file);
    if (!file) {
      throw new AppError('No video file provided', 400);
    }
    tempFilePath = file.path;

    const title = path.parse(file.originalname).name;

    // Create video in BunnyCDN
    console.log('Creating video in BunnyCDN', { title });
    const createVideoRes = await axios.post(
      `https://video.bunnycdn.com/library/${VIDEO_LIBRARY_ID}/videos`,
      { title },
      {
        headers: {
          AccessKey: BUNNY_API_KEY,
          'Content-Type': 'application/json',
        },
      }
    );

    const videoId = createVideoRes.data.guid;
    console.log('Video created successfully', { videoId });

    // Upload video file
    const videoStream = fs.createReadStream(file.path);
    const fileSize = fs.statSync(file.path).size;
    let uploadProgress = 0;

    await axios.put(
      `https://video.bunnycdn.com/library/${VIDEO_LIBRARY_ID}/videos/${videoId}`,
      videoStream,
      {
        headers: {
          AccessKey: BUNNY_API_KEY,
          'Content-Type': 'application/octet-stream',
        },
        maxContentLength: MAX_FILE_SIZE,
        timeout: 300000, // 5 minutes timeout
        onUploadProgress: (progressEvent) => {
          uploadProgress = Math.round((progressEvent.loaded * 100) / fileSize);
        },
      }
    );

    // Generate URLs
    const streamLink = `https://${CDN_HOSTNAME}/${videoId}/playlist.m3u8`;
    const coverImage = `https://${CDN_HOSTNAME}/${videoId}/thumbnail.jpg`;

    // Cleanup temp file
    await cleanupTempFile(file.path);

    // Send response
    const response: VideoUploadResponse = {
      videoId,
      url: streamLink,
      coverImage,
    };

    res.json({
      status: 'success',
      data: response,
    });

    console.log('Video upload completed successfully', { videoId });
  } catch (error) {
    // Cleanup temp file in case of error
    if (tempFilePath) {
      await cleanupTempFile(tempFilePath);
    }

    console.error('Video upload failed', error);

    if (error instanceof AppError) {
      return next(error);
    }

    if (axios.isAxiosError(error)) {
      const errorMessage = error.response?.data?.message || 'Failed to upload video to BunnyCDN';
      return next(new AppError(errorMessage, error.response?.status || 500));
    }

    return next(new AppError('An unexpected error occurred', 500));
  }
});

export const uploadImage = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  if (!req.file) {
    return next(new AppError('No image file provided', 400));
  }
  try {
    const file = req.file;
    //genera unique name with random string
    const imagename = `${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 15)}.${file.mimetype.split('/')[1]}`;
    const filePath = path.join(BUNNY_STORAGE_HOST, imagename);

    //genera unique name
    const imageStream = fs.createReadStream(file.path);
    const response = await axios.put(filePath, imageStream, {
      headers: {
        AccessKey: BUNNY_STORAGE_API_KEY,
        'Content-Type': file.mimetype,
      },
    });

    fs.unlinkSync(file.path);
    res.json({
      status: 'success',
      data: {
        imageUrl: `https://sabikuk.b-cdn.net/${imagename}`,
      },
    });
  } catch (error: any) {
    console.error(error.response?.data || error);
    res.status(500).json({ error: 'Failed to upload image' });
  }
});
