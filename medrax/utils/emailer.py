from __future__ import annotations

"""
Simple SMTP email utility for transactional notifications.

Usage: send_email(to, subject, text, html=None)

Configured via environment variables (use .env in dev):
 - SMTP_HOST
 - SMTP_PORT (default 587)
 - SMTP_USER
 - SMTP_PASS
 - SMTP_FROM (default: SMTP_USER)

If SMTP variables are missing, the function logs and returns without raising,
so that core flows are not blocked in development.
"""

import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart


def _smtp_config():
    host = os.getenv("SMTP_HOST")
    port = int(os.getenv("SMTP_PORT", "587"))
    user = os.getenv("SMTP_USER")
    pwd = os.getenv("SMTP_PASS")
    from_addr = os.getenv("SMTP_FROM") or user
    return host, port, user, pwd, from_addr


def send_email(to: str, subject: str, text: str, html: str | None = None) -> bool:
    host, port, user, pwd, from_addr = _smtp_config()
    if not host or not user or not pwd or not from_addr:
        # Soft-fail in dev: just log payload and return
        print(f"[EMAIL:DEV] To: {to} | Subj: {subject}\n{text}")
        return False

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = to

    part1 = MIMEText(text, "plain")
    msg.attach(part1)
    if html:
        part2 = MIMEText(html, "html")
        msg.attach(part2)

    try:
        with smtplib.SMTP(host, port) as server:
            server.starttls()
            server.login(user, pwd)
            server.sendmail(from_addr, [to], msg.as_string())
        return True
    except Exception as e:
        print(f"[EMAIL:ERROR] Failed to send to {to}: {e}")
        return False
