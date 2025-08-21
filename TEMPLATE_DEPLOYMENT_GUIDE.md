# Template Deployment Guide

## ✅ Issue Resolved: HTML Templates Embedded in TypeScript

### Problem Description (Previously)

The application was failing in production with the error:

```
ENOENT: no such file or directory, open '/home/gafiapay-api/htdocs/api.gafiapay.com/dist/templates/otp-email.html'
```

### Root Cause (Previously)

TypeScript compilation (`tsc`) only compiles `.ts` files to `.js` files but **does not copy static assets** like HTML templates, images, or other non-TypeScript files to the `dist` folder.

### ✅ Solution Implemented

**HTML templates are now embedded directly in TypeScript files**, eliminating the need for separate HTML files and asset copying.

## 📁 Current File Structure

```
src/
├── templates/
│   ├── otpEmail.ts        ← Contains embedded HTML template
│   ├── welcomeEmail.ts    ← Contains embedded HTML template
│   └── logo.png          ← Static image (copied during build)
```

## 🛠️ Implementation Details

### Embedded Templates

**Files:** `src/templates/otpEmail.ts`, `src/templates/welcomeEmail.ts`

Both template files now contain:

- Complete HTML templates with full styling
- All CSS embedded within the templates
- Responsive design with mobile support
- Professional GafiaPay branding

### Updated Build Script

**File:** `scripts/build.sh`

- Simplified build process
- Only copies `logo.png` from templates
- No longer needs to copy HTML files
- Faster build times

## 🚀 Deployment Steps

### Option 1: Use Updated Build Script (Recommended)

```bash
# Build with asset copying
npm run build

# Verify build output
ls -la dist/templates/
```

### Option 2: Use Custom Build Script

```bash
# Make script executable
chmod +x scripts/build.sh

# Run build script
./scripts/build.sh
```

### Option 3: Manual Build

```bash
# Compile TypeScript (HTML templates are embedded)
npm run build

# Copy only logo.png if needed
mkdir -p dist/templates
cp src/templates/logo.png dist/templates/
```

## 🔍 Verification

After building, verify these files exist in `dist/`:

```bash
dist/
├── templates/
│   ├── otpEmail.js        ← Contains embedded HTML template
│   ├── welcomeEmail.js    ← Contains embedded HTML template
│   └── logo.png          ← Static image (optional)
└── server.js             ← Main server file
```

## ✅ Benefits of Embedded Templates

### 1. No File System Dependencies

- Templates are part of the compiled JavaScript
- No risk of missing HTML files in production
- Eliminates ENOENT errors

### 2. Faster Build Process

- No need to copy HTML files during build
- Reduced build complexity
- Fewer moving parts

### 3. Better Version Control

- Template changes are tracked with code changes
- Atomic deployments
- Easier rollbacks

### 4. Improved Performance

- Templates loaded with application code
- No file system reads at runtime
- Faster template rendering

## 🔧 Production Deployment Checklist

### Before Deployment

- [ ] Run `npm run build` to compile TypeScript
- [ ] Verify `dist/templates/` contains compiled JS files
- [ ] Test email functionality in staging environment

### During Deployment

- [ ] Ensure build script runs on production server
- [ ] Copy entire `dist/` folder to production
- [ ] Verify file permissions are correct

### After Deployment

- [ ] Test OTP email sending
- [ ] Test welcome email sending
- [ ] Verify email templates render correctly

## 🐛 Troubleshooting

### Issue: Email templates not rendering

```bash
# Check if TypeScript compiled correctly
ls -la dist/templates/

# Verify template functions exist
node -e "console.log(require('./dist/templates/otpEmail.js'))"
```

### Issue: Logo not displaying in emails

```bash
# Check if logo.png was copied
ls -la dist/templates/logo.png

# Manually copy if needed
cp src/templates/logo.png dist/templates/
```

### Issue: Build fails

```bash
# Check TypeScript compilation
npm run build

# Check for syntax errors in template files
npx tsc --noEmit
```

## 📝 Best Practices

### 1. Template Development

- Edit the embedded HTML directly in TypeScript files
- Test email rendering in development
- Use consistent styling across templates

### 2. Build Process

- Use the updated build script
- Verify compiled output
- Test email functionality before deployment

### 3. Maintenance

- Keep templates up to date with branding
- Test on different email clients
- Monitor email delivery rates

## 🎨 Template Features

### OTP Email Template

- Professional design with GafiaPay branding
- Clear OTP code display
- Security warnings and tips
- Mobile-responsive layout
- Social media links

### Welcome Email Template

- Welcoming design with feature highlights
- Call-to-action buttons
- Security information
- Support contact details
- Mobile-responsive layout

Both templates include:

- Modern CSS with gradients and shadows
- Inter font family for better readability
- Responsive design for mobile devices
- Professional color scheme
- Accessibility considerations
