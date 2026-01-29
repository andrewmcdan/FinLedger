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
    console.log(transporter);
    const mailOptions = {
        from: process.env.SMTP_EMAIL_FROM,
        to: to,
        subject: subject,
        text: body,
    };
    return transporter.sendMail(mailOptions);
}

module.exports = {
    sendEmail,
};
