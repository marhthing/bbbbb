# Deploy WhatsApp Session Manager to Vercel

## 🚀 Quick Setup Guide

### 1. Prerequisites
- GitHub account
- Vercel account (free tier works)
- PostgreSQL database (Neon, Supabase, or similar)

### 2. Environment Variables Setup

In your Vercel dashboard, add these environment variables:

```bash
DATABASE_URL=postgresql://username:password@host:port/database
NODE_ENV=production
```

**How to add environment variables:**
1. Go to your Vercel project dashboard
2. Click "Settings" tab
3. Click "Environment Variables" 
4. Add each variable with Production, Preview, and Development scopes

### 3. Database Schema Setup

Run this SQL in your PostgreSQL database:

```sql
CREATE TABLE whatsapp_sessions (
  id VARCHAR PRIMARY KEY,
  session_data JSONB,
  phone_number TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  pairing_method TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  connected_at TIMESTAMP,
  is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX idx_whatsapp_sessions_phone ON whatsapp_sessions(phone_number);
CREATE INDEX idx_whatsapp_sessions_status ON whatsapp_sessions(status);
```

### 4. File Structure

Your project should have this structure:
```
├── api/
│   └── index.js              # Main serverless function
├── lib/
│   ├── db.js                 # Database connection
│   ├── storage.js            # Database operations
│   └── whatsapp.js           # WhatsApp service (uses /tmp)
├── shared/
│   └── schema.js             # Database schema
├── vercel.json               # Vercel configuration
└── package.json              # Dependencies
```

### 5. Deploy to Vercel

**Option A: GitHub Integration (Recommended)**
1. Push your code to a GitHub repository
2. Go to [vercel.com](https://vercel.com)
3. Click "New Project"
4. Import your GitHub repository
5. Vercel will automatically detect and deploy

**Option B: Vercel CLI**
```bash
npm install -g vercel
vercel login
vercel --prod
```

### 6. API Endpoints

After deployment, your endpoints will be:
```
POST /api/sessions/generate-id          # Generate session ID
POST /api/sessions                      # Create session
POST /api/sessions/:id/request-code     # Request pairing code
POST /api/sessions/:id/qr-pairing       # Start QR pairing
GET  /api/sessions/check/:id            # Check session status
```

### 7. Test Your Deployment

**Generate Pairing Code:**
```bash
curl -X POST https://your-app.vercel.app/api/sessions/generate-id
curl -X POST https://your-app.vercel.app/api/sessions \
  -H "Content-Type: application/json" \
  -d '{"id":"MATDEV-12345678","pairingMethod":"code"}'
curl -X POST https://your-app.vercel.app/api/sessions/MATDEV-12345678/request-code \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"1234567890"}'
```

### 8. Important Notes

**Temporary Storage:**
- Session files are stored in `/tmp` (512MB limit)
- Files are cleaned up after each function execution
- Perfect for WhatsApp authentication which only needs temporary storage

**Database:**
- All persistent data is stored in PostgreSQL
- No local file persistence needed
- Automatic cleanup of duplicate phone numbers

**Scaling:**
- Each function invocation is isolated
- No memory shared between requests
- Automatic scaling based on demand

### 9. Troubleshooting

**Common Issues:**

1. **Database Connection Errors**
   - Verify DATABASE_URL environment variable
   - Check database is accessible from the internet
   - Ensure SSL is configured correctly

2. **WhatsApp Connection Issues**
   - Check Vercel function logs
   - Verify phone number format
   - Ensure /tmp directory has proper permissions

3. **Timeout Errors**
   - Vercel functions have 10-second timeout on Hobby plan
   - Consider upgrading to Pro plan for 60-second timeout

**View Logs:**
```bash
vercel logs your-project-name
```

### 10. Cost Optimization

**Free Tier Limits:**
- 100GB bandwidth/month
- 1000 function invocations/day
- 10-second max function duration

**Pro Tier Benefits:**
- 1TB bandwidth/month
- Unlimited function invocations
- 60-second max function duration
- Better performance

### 11. Security Best Practices

1. **Environment Variables**
   - Never commit DATABASE_URL to git
   - Use Vercel's environment variable system
   - Different variables for development/production

2. **Database Security**
   - Use SSL connections
   - Restrict database access by IP if possible
   - Regular backups

3. **API Security**
   - Add rate limiting if needed
   - Validate all inputs
   - Monitor for unusual activity

### 12. Monitoring

**Built-in Monitoring:**
- Vercel Analytics (function performance)
- Real-time logs
- Error tracking

**Custom Monitoring:**
```javascript
// Add to your functions for monitoring
console.log('Function execution time:', Date.now() - startTime);
console.log('Memory usage:', process.memoryUsage());
```

---

## 🎉 You're Ready!

Your WhatsApp session manager is now serverless and will scale automatically with demand. The `/tmp` directory ensures session files are properly isolated and cleaned up after each request.

Need help? Check Vercel's documentation or the function logs for debugging.