/* ============================================================================
   ULTIMATE NOUGHTS AND CROSSES — making an account, and getting back into one
   ----------------------------------------------------------------------------
   One page for the four things that happen around an account: making one,
   signing in, asking for a way back in, and landing on a link out of an email.
   Which of them you get depends on the address you arrived at.

   Nothing here is clever. The rules a password has to meet are stated before
   you type it rather than after, the same answer comes back whether or not an
   address is on file, and no form pretends to have done something the server
   has not confirmed.
   ============================================================================ */
(function () {
  "use strict";
  var S = window.UNC.site, A = window.UNC.account, P = window.UNC.player;
  var $ = function (sel) { return document.querySelector(sel); };
  var form = $("[data-form]"), said = $("[data-said]"), tabs = $("[data-tabs]");
  var asked = new URLSearchParams(location.search);
  var view = asked.get("in") !== null ? "in" : "join";

  function tell(words, bad) {
    said.textContent = words || "";
    said.className = "netline" + (bad ? " netline--error" : words ? " netline--live" : "");
  }

  /* ---- the four faces of this page --------------------------------------- */
  var faces = {
    join: function () {
      return "<h1 style=\"margin:0 0 var(--s-2);font-size:1.4rem\">Create an account</h1>" +
        '<p class="netline" style="margin:0 0 var(--s-3)">Free, and about twenty ' +
        "seconds. Your games so far stay in this browser either way.</p>" +
        '<label class="lbl" for="name">Name</label>' +
        '<input id="name" type="text" maxlength="20" autocomplete="username" ' +
          'placeholder="what people will call you" />' +
        '<label class="lbl lbl--spaced" for="email">Email</label>' +
        '<input id="email" type="email" autocomplete="email" placeholder="you@example.com" />' +
        '<p class="netline" style="margin-top:.25rem">Only ever used to prove the ' +
        "account is yours and to get you back in. Nothing else is sent to it.</p>" +
        '<label class="lbl lbl--spaced" for="pass">Password</label>' +
        '<input id="pass" type="password" autocomplete="new-password" ' +
          'placeholder="at least eight characters" />' +
        '<div class="row-btn" style="margin-top:var(--s-4)">' +
          '<button class="btn btn--go" type="button" data-go>Create the account</button>' +
        "</div>" +
        '<p class="netline">Already have one? ' +
        '<button class="linkish" type="button" data-to="in">Sign in</button></p>';
    },

    in: function () {
      return "<h1 style=\"margin:0 0 var(--s-2);font-size:1.4rem\">Sign in</h1>" +
        '<label class="lbl" for="name">Name or email</label>' +
        '<input id="name" type="text" autocomplete="username" />' +
        '<label class="lbl lbl--spaced" for="pass">Password</label>' +
        '<input id="pass" type="password" autocomplete="current-password" />' +
        '<div class="row-btn" style="margin-top:var(--s-4)">' +
          '<button class="btn btn--go" type="button" data-go>Sign in</button>' +
        "</div>" +
        '<p class="netline">' +
        '<button class="linkish" type="button" data-to="forgot">Forgotten your password?</button>' +
        " · <button class=\"linkish\" type=\"button\" data-to=\"join\">Create an account</button></p>";
    },

    forgot: function () {
      return "<h1 style=\"margin:0 0 var(--s-2);font-size:1.4rem\">Getting back in</h1>" +
        '<p class="netline" style="margin:0 0 var(--s-3)">Tell us the name or the ' +
        "address on the account and a link comes back by email. It is good for an hour.</p>" +
        '<label class="lbl" for="name">Name or email</label>' +
        '<input id="name" type="text" autocomplete="username" />' +
        '<div class="row-btn" style="margin-top:var(--s-4)">' +
          '<button class="btn btn--go" type="button" data-go>Send the link</button>' +
        "</div>" +
        '<p class="netline"><button class="linkish" type="button" data-to="in">' +
        "Back to signing in</button></p>";
    },

    reset: function () {
      return "<h1 style=\"margin:0 0 var(--s-2);font-size:1.4rem\">A new password</h1>" +
        '<p class="netline" style="margin:0 0 var(--s-3)">Setting this signs out ' +
        "everywhere else, which is the point of it.</p>" +
        '<label class="lbl" for="pass">New password</label>' +
        '<input id="pass" type="password" autocomplete="new-password" ' +
          'placeholder="at least eight characters" />' +
        '<div class="row-btn" style="margin-top:var(--s-4)">' +
          '<button class="btn btn--go" type="button" data-go>Set it and sign in</button>' +
        "</div>";
    },

    done: function (words, link) {
      return "<h1 style=\"margin:0 0 var(--s-2);font-size:1.4rem\">" + S.esc(words.title) + "</h1>" +
        "<p>" + words.body + "</p>" +
        '<div class="row-btn" style="margin-top:var(--s-4)">' +
          '<a class="btn btn--go" style="width:auto" href="' + (link || "index.html") +
            '">' + S.esc(words.go || "To the lobby") + "</a>" +
        "</div>";
    }
  };

  /* ---- what each face does when you press its button --------------------- */
  var doing = {
    join: function () {
      var fields = {
        name: $("#name").value, email: $("#email").value, password: $("#pass").value
      };
      tell("Making your account…");
      A.join(fields, true).then(function (got) {
        show("done", {
          title: "Welcome, " + got.me.name,
          body: got.posted
            ? "A letter is on its way to <b>" + S.esc(got.me.email) + "</b> to prove " +
              "the address is yours. You can play straight away — it only matters " +
              "for getting back in if you forget your password."
            : "You are signed in. This server has no mail service set up, so the " +
              "address is not proved — which only matters if you forget your password.",
          go: "Find an opponent"
        });
        tell("");
      }, fail);
    },

    in: function () {
      tell("Signing in…");
      A.join({ name: $("#name").value, password: $("#pass").value }, false)
        .then(function (got) {
          show("done", {
            title: "Signed in as " + got.me.name,
            body: "Your games and your rating are where you left them.",
            go: "Find an opponent"
          });
          tell("");
        }, fail);
    },

    forgot: function () {
      tell("Asking…");
      A.forgot($("#name").value).then(function (got) {
        show("done", {
          title: "Check your email",
          body: S.esc(got.said),
          go: "Back to the lobby"
        });
        tell("");
      }, fail);
    },

    reset: function () {
      tell("Setting it…");
      A.reset(asked.get("reset"), $("#pass").value).then(function (me) {
        show("done", {
          title: "Done — you are signed in",
          body: "Your password is changed and every other session is signed out.",
          go: "Find an opponent"
        });
        tell("");
      }, fail);
    }
  };

  function fail(err) { tell(err.message, true); }

  function show(which, words, link) {
    view = which;
    tabs.hidden = which !== "join" && which !== "in";
    tabs.querySelectorAll("[data-tab]").forEach(function (b) {
      b.classList.toggle("tab--on", b.getAttribute("data-tab") === which);
    });
    form.innerHTML = which === "done" ? faces.done(words, link) : faces[which]();

    var go = $("[data-go]");
    if (go) go.addEventListener("click", doing[which]);
    form.querySelectorAll("[data-to]").forEach(function (b) {
      b.addEventListener("click", function () { tell(""); show(b.getAttribute("data-to")); });
    });
    form.querySelectorAll("input").forEach(function (input) {
      input.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter" && doing[which]) { ev.preventDefault(); doing[which](); }
      });
    });
    var first = form.querySelector("input");
    if (first) first.focus();
  }

  tabs.querySelectorAll("[data-tab]").forEach(function (b) {
    b.addEventListener("click", function () { tell(""); show(b.getAttribute("data-tab")); });
  });

  /* ---- go ----------------------------------------------------------------- */
  S.ready(function () {
    if (!A.configured()) {
      tabs.hidden = true;
      form.innerHTML = S.nothing("people", "This site has no server yet",
        "Accounts, the ladder and refereed games all need one. Everything else — " +
        "a private room with a friend, the engine, two people at one device — " +
        "works here as it is, and what you play is kept in this browser.",
        '<a class="btn btn--go" style="width:auto" href="index.html">Back to the lobby</a>' +
        '<a class="btn" href="https://github.com/HusaynYahya/noughtsandcrosses/blob/main/server/README.md">' +
        "How to run one</a>");
      return;
    }

    /* landing on a link out of a letter */
    if (asked.get("verify")) {
      form.innerHTML = "<p>Proving your address…</p>";
      tabs.hidden = true;
      A.verify(asked.get("verify")).then(function (me) {
        show("done", {
          title: "That is proved",
          body: "<b>" + S.esc(me.email) + "</b> is yours, and can get you back in.",
          go: "To the lobby"
        });
      }, function (err) {
        show("done", { title: "That link is no good", body: S.esc(err.message),
                       go: "To the lobby" });
      });
      return;
    }
    if (asked.get("reset")) { show("reset"); return; }

    if (A.me()) {
      /* already signed in: no point showing a form */
      show("done", {
        title: "Signed in as " + A.me().name,
        body: "Your profile has your rating, your games and the rest of your " +
              "account settings.",
        go: "Your profile"
      }, "profile.html");
      return;
    }
    show(view);
  });
})();
