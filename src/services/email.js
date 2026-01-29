// This file shall provide email sending functionalities using nodemailer.

const logger = require("../utils/logger");
const utilities = require("../utils/utilities");
const nodemailer = require("nodemailer");

// Configure the email transporter
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: true, // true for 465, false for other ports
    auth: {
        user: process.env.SMTP_USERNAME,
        pass: process.env.SMTP_PASSWORD,
    },
});

function sendEmail(to, subject, body) {
    // Placeholder function to simulate email sending
    logger.log("info", `Sending email to ${to} with subject "${subject}"`, { function: "sendEmail" }, utilities.getCallerInfo());
    const mailOptions = {
        from: process.env.SMTP_EMAIL_FROM,
        to: to,
        subject: subject,
        text: body,
    };
    return transporter.sendMail(mailOptions)
        .then((result) => {
            logger.log("debug", `Email sent to ${to}`, { function: "sendEmail", messageId: result?.messageId }, utilities.getCallerInfo());
            return result;
        })
        .catch((error) => {
            logger.log("error", `Failed to send email to ${to}: ${error.message}`, { function: "sendEmail" }, utilities.getCallerInfo());
            throw error;
        });
}

module.exports = {
    sendEmail,
};
