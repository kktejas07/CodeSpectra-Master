# KYC Integration Setup Guide

## Didit (Global KYC)

### Step 1: Create Account
1. Go to https://business.didit.me
2. Sign up with your work email (no credit card required)
3. You get instant access to sandbox + 500 free verifications/month

### Step 2: Create Workflow
1. In Didit dashboard, go to Workflows
2. Create a new workflow with these features:
   - ID_VERIFICATION
   - LIVENESS
   - FACE_MATCH
   - IP_ANALYSIS
3. Copy the `workflow_id`

### Step 3: Get API Key
1. Go to Settings → API Keys
2. Copy your API key

### Step 4: Set Up Webhook
1. Go to Settings → Webhooks
2. Add endpoint: `https://codespectra.ai/api/kyc/didit/webhook`
3. Subscribe to events: `session.verified`, `session.declined`, `session.review_started`
4. Copy the webhook secret

### Step 5: Add Environment Variables
Add to `.env.local`:
```
DIDIT_API_KEY=your_api_key_here
DIDIT_WORKFLOW_ID=your_workflow_id_here
DIDIT_WEBHOOK_SECRET=your_webhook_secret_here
```

---

## API Setu / DigiLocker (Indian KYC)

### Step 1: Register as Requester
1. Go to https://partners.apisetu.gov.in/signup
2. Select "Requester" (you consume APIs)
3. Fill organization details
4. Wait for approval (2-3 days)

### Step 2: Get Credentials
1. After approval, you get `client_id` and `client_secret`
2. Sandbox URL: https://sandbox.api-setu.in
3. Production URL: https://api.setu.gov.in

### Step 3: Add Environment Variables
```
DIGILOCKER_CLIENT_ID=your_client_id
DIGILOCKER_CLIENT_SECRET=your_client_secret
DIGILOCKER_REDIRECT_URI=https://codespectra.ai/api/kyc/digilocker/callback
```

---

## Verification Flow

### For Users:
1. User goes to `/dashboard/identity-verify`
2. Clicks "Start Identity Verification"
3. Redirected to Didit's hosted verification page
4. Uploads ID + takes selfie
5. Results sent via webhook
6. User sees verification status

### For Admins:
1. Go to `/dashboard/admin/kyc`
2. See all verification records
3. Filter by status (approved/rejected/pending)
4. View detailed results per user

---

## Free Tier Limits

| Service | Free Limit | Overage Cost |
|---------|-----------|--------------|
| Didit | 500/month | $0.33/check |
| API Setu | Unlimited | Free |
| DigiLocker | Unlimited | Free |

---

## Testing

### Didit Sandbox
- Sandbox is enabled by default on signup
- Test with synthetic documents
- Sandbox sessions don't count toward free quota

### API Setu Sandbox
- Access at https://sandbox.api-setu.in
- No sign-up required
- Test with sample Aadhaar/PAN data
