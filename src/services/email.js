// This file shall provide email sending functionalities using nodemailer.

const logger = require("../utils/logger");
const utilities = require("../utils/utilities");
const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");
const { renderEmail } = require("./email_renderer");

const DEFAULT_FRONTEND_BASE_URL = "http://localhost:3050";

function getFrontendBaseUrl() {
    const rawBaseUrl = String(process.env.FRONTEND_BASE_URL || "").trim();
    if (!rawBaseUrl) {
        return DEFAULT_FRONTEND_BASE_URL;
    }
    if (/^https?:\/\//i.test(rawBaseUrl)) {
        return rawBaseUrl.replace(/\/+$/, "");
    }
    return `http://${rawBaseUrl.replace(/\/+$/, "")}`;
}

const DEFAULT_COMPANY_NAME = process.env.EMAIL_COMPANY_NAME || "FinLedger";
const DEFAULT_COMPANY_ADDRESS = process.env.EMAIL_COMPANY_ADDRESS || "Financial management system";
const DEFAULT_HEADER_RIGHT_TEXT = process.env.EMAIL_HEADER_RIGHT_TEXT || "Financial management system";
const DEFAULT_SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || "support@finledger.com";
const DEFAULT_LOGO_URL = process.env.EMAIL_LOGO_URL || `${getFrontendBaseUrl()}/public_images/FL-logo.png`;
const DEFAULT_HTML_TEXT_FALLBACK = "This is an HTML email. Please view it in an HTML-compatible email viewer.";
const DEFAULT_EMBEDDED_LOGO_PATH = process.env.EMAIL_LOGO_PATH || path.resolve(__dirname, "../../web/public_images/FL-logo.png");
const DEFAULT_EMBEDDED_LOGO_CID = process.env.EMAIL_LOGO_CID || "finledger-logo@email";
const DEFAULT_SMTP_PORT = 587;

let transporter = null;

function parseBooleanEnv(value) {
    const normalized = String(value ?? "").trim().toLowerCase();
    if (!normalized) {
        return null;
    }
    if (["1", "true", "yes", "on"].includes(normalized)) {
        return true;
    }
    if (["0", "false", "no", "off"].includes(normalized)) {
        return false;
    }
    return null;
}

function getSmtpPort() {
    const parsed = Number.parseInt(String(process.env.SMTP_PORT || "").trim(), 10);
    if (Number.isInteger(parsed) && parsed > 0) {
        return parsed;
    }
    return DEFAULT_SMTP_PORT;
}

function buildSmtpTransportOptions() {
    const port = getSmtpPort();
    const secureOverride = parseBooleanEnv(process.env.SMTP_SECURE);
    const requireTlsOverride = parseBooleanEnv(process.env.SMTP_REQUIRE_TLS);
    const secure = secureOverride ?? (port === 465);

    return {
        host: process.env.SMTP_HOST,
        port,
        secure,
        requireTLS: requireTlsOverride ?? false,
        auth: {
            user: process.env.SMTP_USERNAME,
            pass: process.env.SMTP_PASSWORD,
        },
    };
}

function getTransporter() {
    if (!transporter) {
        transporter = nodemailer.createTransport(buildSmtpTransportOptions());
    }
    return transporter;
}

function looksLikeHtml(content) {
    return typeof content === "string" && /<!doctype html>|<html[\s>]/i.test(content);
}

function buildTemplateDefaults(subject, templateData = {}) {
    return {
        subject,
        title: subject,
        preheader: "",
        headerRightText: DEFAULT_HEADER_RIGHT_TEXT,
        companyName: DEFAULT_COMPANY_NAME,
        companyAddress: DEFAULT_COMPANY_ADDRESS,
        logoUrl: DEFAULT_LOGO_URL,
        supportEmail: DEFAULT_SUPPORT_EMAIL,
        ...templateData,
    };
}

function shouldEmbedLogo() {
    const flag = String(process.env.EMAIL_EMBED_LOGO || "true").trim().toLowerCase();
    return !(flag === "0" || flag === "false" || flag === "no" || flag === "off");
}

function resolveEmbeddedLogoAttachment() {
    if (!shouldEmbedLogo()) {
        return null;
    }
    try {
        fs.accessSync(DEFAULT_EMBEDDED_LOGO_PATH, fs.constants.R_OK);
        return {
            filename: path.basename(DEFAULT_EMBEDDED_LOGO_PATH),
            path: DEFAULT_EMBEDDED_LOGO_PATH,
            cid: DEFAULT_EMBEDDED_LOGO_CID,
        };
    } catch {
        logger.log("warn", `Email logo file not found/readable at ${DEFAULT_EMBEDDED_LOGO_PATH}; falling back to URL logo`, { function: "resolveEmbeddedLogoAttachment" }, utilities.getCallerInfo());
        return null;
    }
}

function mergeAttachments(existingAttachments = [], maybeNewAttachment = null) {
    const normalized = Array.isArray(existingAttachments) ? [...existingAttachments] : [];
    if (!maybeNewAttachment) {
        return normalized;
    }
    const duplicate = normalized.some((attachment) => String(attachment?.cid || "").trim().toLowerCase() === String(maybeNewAttachment.cid).trim().toLowerCase());
    if (!duplicate) {
        normalized.push(maybeNewAttachment);
    }
    return normalized;
}

async function sendTemplatedEmail({ to, subject, templateName, text, templateData = {}, attachments = [] }) {
    const embeddedLogo = resolveEmbeddedLogoAttachment();
    const effectiveTemplateData = { ...templateData };
    let effectiveAttachments = Array.isArray(attachments) ? [...attachments] : [];

    if (!effectiveTemplateData.logoUrl && embeddedLogo) {
        effectiveTemplateData.logoUrl = `cid:${embeddedLogo.cid}`;
        effectiveAttachments = mergeAttachments(effectiveAttachments, embeddedLogo);
    }

    const html = await renderEmail(templateName, buildTemplateDefaults(subject, effectiveTemplateData));
    return sendEmail(to, subject, html, text || null, { attachments: effectiveAttachments });
}

function sendEmail(to, subject, body, text = null, options = {}) {
    logger.log("info", `Sending email to ${to} with subject "${subject}"`, { function: "sendEmail" }, utilities.getCallerInfo());

    let textBody = typeof body === "string" ? body : "";
    let htmlBody = null;

    if (looksLikeHtml(body)) {
        htmlBody = body;
        textBody = text || DEFAULT_HTML_TEXT_FALLBACK;
    } else if (!textBody && typeof text === "string") {
        textBody = text;
    }

    const mailOptions = {
        from: `${DEFAULT_COMPANY_NAME} <${process.env.SMTP_EMAIL_FROM}>`,
        to: to,
        subject: subject,
        text: textBody,
        html: htmlBody || undefined,
        attachments: Array.isArray(options.attachments) && options.attachments.length > 0 ? options.attachments : undefined,
    };
    const transportOptions = buildSmtpTransportOptions();
    return getTransporter().sendMail(mailOptions)
        .then((result) => {
            logger.log("debug", `Email sent to ${to}`, { function: "sendEmail", messageId: result?.messageId }, utilities.getCallerInfo());
            return result;
        })
        .catch((error) => {
            logger.log(
                "error",
                `Failed to send email to ${to}: ${error.message}`,
                {
                    function: "sendEmail",
                    smtp_host: transportOptions.host,
                    smtp_port: transportOptions.port,
                    smtp_secure: transportOptions.secure,
                    smtp_require_tls: transportOptions.requireTLS,
                },
                utilities.getCallerInfo(),
            );
            throw error;
        });
}

module.exports = {
    buildSmtpTransportOptions,
    sendTemplatedEmail,
    sendEmail,
    __resetTransporterForTests: () => {
        transporter = null;
    },
    __setTransporterForTests: (nextTransporter) => {
        transporter = nextTransporter;
    },
};
