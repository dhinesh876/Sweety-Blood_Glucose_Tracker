// Demo mailer: prints the reset link to the server console.
// For real email, replace the body of sendResetLink with nodemailer / SES / SendGrid.
const mailer = {
    async sendResetLink(email, link) {
        console.log(`\n[password reset] ${email}\n  ${link}\n  (valid for 30 minutes)\n`);
    },
};

module.exports = mailer;