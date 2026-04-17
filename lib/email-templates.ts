// Email Templates
export const emailTemplates = {
  welcomeEmail: (name: string) => ({
    subject: 'Welcome to CodeSpectra',
    html: `
      <h1>Welcome to CodeSpectra, ${name}!</h1>
      <p>We're excited to have you on board.</p>
      <p>Get started by:</p>
      <ul>
        <li>Connecting your first repository</li>
        <li>Running your first code scan</li>
        <li>Exploring our integrations</li>
      </ul>
      <p>If you have any questions, reach out to our support team.</p>
    `,
  }),

  jobApplicationConfirmation: (jobTitle: string, companyName: string) => ({
    subject: `Application Confirmed: ${jobTitle} at ${companyName}`,
    html: `
      <h1>Application Received</h1>
      <p>Thank you for your interest in the <strong>${jobTitle}</strong> position at <strong>${companyName}</strong>.</p>
      <p>We've received your application and our team will review it shortly.</p>
      <p>You can track your application status in your CodeSpectra dashboard.</p>
    `,
  }),

  examStartedNotification: (examTitle: string) => ({
    subject: `You've started: ${examTitle}`,
    html: `
      <h1>Exam Started</h1>
      <p>You've successfully started the <strong>${examTitle}</strong> exam.</p>
      <p>Good luck! Remember to review all questions carefully.</p>
    `,
  }),

  subscriptionConfirmation: (planName: string, amount: number) => ({
    subject: 'Subscription Confirmed',
    html: `
      <h1>Thank You for Your Subscription</h1>
      <p>You've successfully subscribed to the <strong>${planName}</strong> plan.</p>
      <p>Monthly charge: <strong>$${amount}</strong></p>
      <p>Access all premium features immediately.</p>
    `,
  }),

  invoiceNotification: (invoiceId: string, amount: number) => ({
    subject: `Invoice #${invoiceId}`,
    html: `
      <h1>New Invoice</h1>
      <p>Your invoice <strong>#${invoiceId}</strong> for <strong>$${amount}</strong> is ready.</p>
      <p>Download your invoice from your billing dashboard.</p>
    `,
  }),
}

// Email sending function (mock)
export async function sendEmail(to: string, template: { subject: string; html: string }) {
  // In production, integrate with Resend, SendGrid, or similar service
  console.log(`[Email] Sending to ${to}: ${template.subject}`)
  return { success: true, messageId: `msg_${Date.now()}` }
}
