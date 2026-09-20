/* ============================================================================
   Sending an email, when there is anywhere to send it
   ----------------------------------------------------------------------------
   Proving an address and getting back in without a password both need mail,
   and mail needs somebody else's machine. Rather than pick a provider, this
   posts to whatever HTTP endpoint you point it at — Resend, Postmark, Mailgun,
   your own — with the shape they nearly all take.

     UNC_MAIL_URL   https://api.resend.com/emails
     UNC_MAIL_KEY   the bearer token
     UNC_MAIL_FROM  "Ultimate noughts and crosses <play@example.com>"

   With none of that set, nothing is sent and the link is written to the log
   instead, which is what you want while you are still setting the thing up: an
   account still works, it is simply not proved.
   ============================================================================ */
"use strict";

const URL_ = process.env.UNC_MAIL_URL || "";
const KEY = process.env.UNC_MAIL_KEY || "";
const FROM = process.env.UNC_MAIL_FROM || "Ultimate noughts and crosses <noreply@localhost>";

function configured() { return !!(URL_ && KEY); }

function send(to, subject, text) {
  if (!configured()) {
    console.log("[unc] no mail service set, so this went nowhere:\n" +
                "      to: " + to + "\n      " + subject + "\n      " +
                text.replace(/\n/g, "\n      "));
    return Promise.resolve({ sent: false, logged: true });
  }
  return fetch(URL_, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + KEY },
    body: JSON.stringify({ from: FROM, to: [to], subject: subject, text: text })
  }).then(function (res) {
    if (!res.ok) throw new Error("the mail service said no (" + res.status + ")");
    return { sent: true };
  }).catch(function (err) {
    console.log("[unc] mail failed: " + err.message);
    return { sent: false, error: err.message };
  });
}

/* The two letters this site sends. Both are short, both say plainly what they
   are for, and neither asks for anything back but a click. */
module.exports = {
  configured: configured,
  send: send,
  verify: function (to, name, link) {
    return send(to, "Prove your address — ultimate noughts and crosses",
      "Hello " + name + ",\n\n" +
      "Open this to prove this address is yours:\n\n  " + link + "\n\n" +
      "It is good for a day. If you did not make an account, nothing happens " +
      "if you ignore this.\n");
  },
  reset: function (to, name, link) {
    return send(to, "Getting back in — ultimate noughts and crosses",
      "Hello " + name + ",\n\n" +
      "Open this to set a new password:\n\n  " + link + "\n\n" +
      "It is good for an hour, and only once. If you did not ask for it, " +
      "ignore it — your password has not changed.\n");
  }
};
