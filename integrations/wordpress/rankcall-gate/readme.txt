=== Rankcall Quality Gate ===
Contributors: rankcall
Tags: seo, quality, programmatic seo, publishing
Requires at least: 5.6
Tested up to: 6.6
Requires PHP: 7.4
Stable tag: 0.1.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Scores every post with the Rankcall Quality gate as it is published: Index, Improve or Kill, with the three strongest reasons.

== Description ==

When a post (or any public post type you choose) moves to Published, the plugin sends its title, slug, content, excerpt, permalink and template or post type to Rankcall's `POST /api/v1/gate/check`. The verdict, confidence, reasons and fixes are saved on the post and shown in a "Rankcall Quality Gate" box in the editor and as an admin notice.

* **Block publishing on Kill** (optional): a post with a Kill verdict is saved as Pending review (or Draft) instead of going live, and the reasons are shown.
* **Check with Rankcall** button in the editor box: scores the last saved version at any time without changing its status.
* Fails open: if Rankcall cannot be reached within 15 seconds, the post is published and the error is shown.
* Scheduled posts are checked when they go live; with blocking on, a Kill moves them back to Pending.
* Edits to posts that are already published are not re-checked automatically; use the button.

The plugin talks only to the Rankcall address you enter. It sends the post's content and the API key (in the Authorization header) on each check.

== Installation ==

1. In Rankcall, open Settings → API keys and create a key with the `gate:check` scope. Copy it; it is shown once.
2. On the site's Quality gate page in Rankcall, download this plugin and copy the site id.
3. In WordPress, go to Plugins → Add New → Upload Plugin, upload `rankcall-gate.zip` and activate it.
4. Go to Settings → Rankcall Gate, enter the Rankcall address (https://…), the API key and the site id, choose post types, and decide whether Kill should block publishing.

== Frequently Asked Questions ==

= Where is the API key stored? =

In the `rankcall_gate_settings` option in your WordPress database. It is never printed back into the settings form. Revoke it in Rankcall if it leaks.

= What happens in the block editor? =

The block editor saves through the REST API, so the admin notice appears on the next screen load; the Rankcall box in the editor sidebar shows the result after a reload.

== Changelog ==

= 0.1.0 =
* First release.
