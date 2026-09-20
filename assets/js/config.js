/* ============================================================================
   Where the server is, if there is one
   ----------------------------------------------------------------------------
   Leave this empty and the site works as it always has: no accounts, private
   rooms passed between friends, ratings each browser keeps for itself.

   Put a server's address in and the site grows the things only a server can
   do — accounts, a ladder everybody is on, games kept somewhere other than
   your own browser, and a referee neither player can argue with.

     window.UNC_SERVER = "https://unc.example.com";

   It can also be set for one visit with ?server=… in the address, which is
   how you would try a server out before committing the site to it.
   ============================================================================ */
window.UNC_SERVER = window.UNC_SERVER || "";
