> **Customer Documentation**
> **Last Updated**: 2026-07-08
> **Audience**: Logged-in users (students, developers, recruiters, admins)

# Billing Guide

Manage your subscription, payment methods, and invoices from the billing page (`/dashboard/billing`).

## View Current Plan

The billing page displays your current plan card showing:
- **Plan name** — Free, Pro, or Enterprise
- **Billing cycle** — Monthly or Annual
- **Price** — current amount charged per cycle
- **Status** — Active or Canceled
- **Included features** — list of features available on your plan
- **Next renewal date** — when your next billing period starts
- **Receipt email** — where invoices are sent

## Upgrade to Pro

1. Click **Upgrade / Change Plan** on your current plan card
2. Select a plan from the dialog (Free, Pro, Enterprise)
3. Choose billing interval — Monthly or Annual (annual saves ~15%)
4. Click **Pay & Activate**
5. You'll be redirected to the payment processor to complete checkout

### Checkout Flow
Payment processing is handled by **Razorpay** (primary) with Stripe as a legacy option. After payment:
- Your plan is updated immediately
- A receipt is emailed to your account email
- You're redirected back to the billing page

## Payment Methods

The billing page shows your saved payment method with:
- Card brand (Visa, Mastercard, etc.)
- Last 4 digits
- Expiration date
- Default status

### Edit Payment Method
1. Click **Edit card** on the payment method card
2. Update the card brand, last 4 digits, or expiration date
3. Click **Save**

Note: Payment method editing is a demo/label-only feature — actual card changes should be made through the payment gateway.

## Invoices

The invoice history table lists all past transactions with:
- Invoice ID
- Date
- Amount (in your billing currency)
- Status
- **View** — click to see invoice details
- **Download** — download the invoice PDF

### Supported Currencies
USD ($), INR (₹), EUR (€), GBP (£), CAD, AUD, SGD, JPY.

## Change Billing Cycle

1. Click **Change billing cycle**
2. Choose Monthly or Annual
3. Confirm the change

The new cycle takes effect at the next renewal.

## Cancel Subscription

1. Click **Cancel subscription**
2. Read the confirmation dialog — you keep access until the end of the current billing period
3. Click **Confirm cancel**

Your plan will show as "Canceled" and you retain access until the period end date. You can resubscribe anytime.

## Notes

- Free plan users see a limited billing page with upgrade prompts
- Some billing features may show "not configured" placeholders if the billing backend is not fully set up
- The Razorpay webhook endpoint is at `/api/billing/webhook`
