<?php
/**
 * Removes the plugin's settings when it is deleted from the Plugins screen.
 * Verdicts stored on posts (_rankcall_gate) are kept as an audit trail; delete them with
 * `wp post meta delete` if you want them gone.
 */

if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

delete_option( 'rankcall_gate_settings' );
