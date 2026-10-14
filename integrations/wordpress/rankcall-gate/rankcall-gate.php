<?php
/**
 * Plugin Name:       Rankcall Quality Gate
 * Description:       Sends posts to the Rankcall Quality gate when they are published and shows the Index, Improve or Kill verdict with its reasons. Can hold Kill pages back as pending.
 * Version:           0.1.0
 * Requires at least: 5.6
 * Requires PHP:      7.4
 * Author:            Rankcall
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       rankcall-gate
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Rankcall_Gate {

	const OPTION   = 'rankcall_gate_settings';
	const META     = '_rankcall_gate';
	const NOTICE   = 'rankcall_gate_notice_';
	const VERSION  = '0.1.0';
	const TIMEOUT  = 15;

	/** Results from the pre-save check, keyed by post ID (0 for a post that has no ID yet). */
	private static $pending = array();

	/** Post IDs already checked in this request, so one publish is never checked twice. */
	private static $checked = array();

	/** True while this plugin changes a post's status itself. */
	private static $updating = false;

	public static function init() {
		add_action( 'admin_menu', array( __CLASS__, 'add_settings_page' ) );
		add_action( 'admin_init', array( __CLASS__, 'register_settings' ) );
		add_filter( 'wp_insert_post_data', array( __CLASS__, 'before_save' ), 99, 2 );
		add_action( 'wp_after_insert_post', array( __CLASS__, 'after_save' ), 10, 2 );
		add_action( 'transition_post_status', array( __CLASS__, 'on_transition' ), 1, 3 );
		add_action( 'add_meta_boxes', array( __CLASS__, 'add_meta_box' ) );
		add_action( 'admin_post_rankcall_gate_check', array( __CLASS__, 'handle_manual_check' ) );
		add_action( 'admin_notices', array( __CLASS__, 'show_notice' ) );
	}

	// ---------------------------------------------------------------- settings

	public static function defaults() {
		return array(
			'api_url'        => '',
			'api_key'        => '',
			'site_id'        => '',
			'block_on_kill'  => 0,
			'blocked_status' => 'pending',
			'post_types'     => array( 'post', 'page' ),
		);
	}

	public static function settings() {
		$saved = get_option( self::OPTION, array() );
		return wp_parse_args( is_array( $saved ) ? $saved : array(), self::defaults() );
	}

	public static function configured() {
		$s = self::settings();
		return '' !== $s['api_url'] && '' !== $s['api_key'] && '' !== $s['site_id'];
	}

	public static function add_settings_page() {
		add_options_page(
			__( 'Rankcall Quality Gate', 'rankcall-gate' ),
			__( 'Rankcall Gate', 'rankcall-gate' ),
			'manage_options',
			'rankcall-gate',
			array( __CLASS__, 'render_settings_page' )
		);
	}

	public static function register_settings() {
		register_setting(
			'rankcall_gate',
			self::OPTION,
			array(
				'type'              => 'array',
				'sanitize_callback' => array( __CLASS__, 'sanitize_settings' ),
				'default'           => self::defaults(),
			)
		);
	}

	public static function sanitize_settings( $input ) {
		$old = self::settings();
		$in  = is_array( $input ) ? $input : array();
		$out = self::defaults();

		$url = isset( $in['api_url'] ) ? esc_url_raw( trim( (string) $in['api_url'] ), array( 'https', 'http' ) ) : '';
		if ( $url && 0 === strpos( $url, 'http://' ) && ! preg_match( '#^http://(localhost|127\.0\.0\.1)(:\d+)?(/|$)#', $url ) ) {
			add_settings_error( self::OPTION, 'rankcall_http', __( 'Use an https:// address for Rankcall so the API key is not sent in clear text.', 'rankcall-gate' ) );
			$url = $old['api_url'];
		}
		$out['api_url'] = untrailingslashit( $url );

		// The key is never printed back into the form; an empty field keeps the saved key.
		$key = isset( $in['api_key'] ) ? trim( (string) $in['api_key'] ) : '';
		if ( '' === $key ) {
			$out['api_key'] = $old['api_key'];
		} elseif ( preg_match( '/^rk_live_[0-9A-Za-z]{43}$/', $key ) ) {
			$out['api_key'] = $key;
		} else {
			add_settings_error( self::OPTION, 'rankcall_key', __( 'That does not look like a Rankcall API key (it starts with rk_live_). The saved key was kept.', 'rankcall-gate' ) );
			$out['api_key'] = $old['api_key'];
		}
		if ( ! empty( $in['forget_key'] ) ) {
			$out['api_key'] = '';
		}

		$site            = isset( $in['site_id'] ) ? sanitize_text_field( (string) $in['site_id'] ) : '';
		$out['site_id']  = preg_match( '/^[A-Za-z0-9_-]{1,64}$/', $site ) ? $site : '';
		$out['block_on_kill']  = empty( $in['block_on_kill'] ) ? 0 : 1;
		$out['blocked_status'] = ( isset( $in['blocked_status'] ) && 'draft' === $in['blocked_status'] ) ? 'draft' : 'pending';

		$types = isset( $in['post_types'] ) && is_array( $in['post_types'] ) ? array_map( 'sanitize_key', $in['post_types'] ) : array();
		$out['post_types'] = array_values( array_intersect( $types, get_post_types( array( 'public' => true ) ) ) );
		return $out;
	}

	public static function render_settings_page() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		$s     = self::settings();
		$types = get_post_types( array( 'public' => true ), 'objects' );
		?>
		<div class="wrap">
			<h1><?php esc_html_e( 'Rankcall Quality Gate', 'rankcall-gate' ); ?></h1>
			<p><?php esc_html_e( 'Every post you publish is scored by the Rankcall Quality gate: Index, Improve or Kill, with the reasons. Create an API key in Rankcall under Settings, API keys, and copy the site id from the Quality gate page.', 'rankcall-gate' ); ?></p>
			<?php settings_errors( self::OPTION ); ?>
			<form method="post" action="options.php">
				<?php settings_fields( 'rankcall_gate' ); ?>
				<table class="form-table" role="presentation">
					<tr>
						<th scope="row"><label for="rankcall-api-url"><?php esc_html_e( 'Rankcall address', 'rankcall-gate' ); ?></label></th>
						<td>
							<input type="url" id="rankcall-api-url" class="regular-text code" name="<?php echo esc_attr( self::OPTION ); ?>[api_url]" value="<?php echo esc_attr( $s['api_url'] ); ?>" placeholder="https://" />
							<p class="description"><?php esc_html_e( 'The address you use to open Rankcall, without a path.', 'rankcall-gate' ); ?></p>
						</td>
					</tr>
					<tr>
						<th scope="row"><label for="rankcall-api-key"><?php esc_html_e( 'API key', 'rankcall-gate' ); ?></label></th>
						<td>
							<input type="password" id="rankcall-api-key" class="regular-text code" name="<?php echo esc_attr( self::OPTION ); ?>[api_key]" value="" autocomplete="off" placeholder="<?php echo $s['api_key'] ? esc_attr( 'rk_live_…' . substr( $s['api_key'], -4 ) ) : 'rk_live_…'; ?>" />
							<p class="description"><?php echo $s['api_key'] ? esc_html__( 'A key is saved. Leave this empty to keep it.', 'rankcall-gate' ) : esc_html__( 'Needs the gate:check scope.', 'rankcall-gate' ); ?></p>
							<?php if ( $s['api_key'] ) : ?>
								<label><input type="checkbox" name="<?php echo esc_attr( self::OPTION ); ?>[forget_key]" value="1" /> <?php esc_html_e( 'Remove the saved key', 'rankcall-gate' ); ?></label>
							<?php endif; ?>
						</td>
					</tr>
					<tr>
						<th scope="row"><label for="rankcall-site-id"><?php esc_html_e( 'Site id', 'rankcall-gate' ); ?></label></th>
						<td><input type="text" id="rankcall-site-id" class="regular-text code" name="<?php echo esc_attr( self::OPTION ); ?>[site_id]" value="<?php echo esc_attr( $s['site_id'] ); ?>" /></td>
					</tr>
					<tr>
						<th scope="row"><?php esc_html_e( 'Post types', 'rankcall-gate' ); ?></th>
						<td>
							<fieldset>
								<?php foreach ( $types as $type ) : ?>
									<label style="display:block"><input type="checkbox" name="<?php echo esc_attr( self::OPTION ); ?>[post_types][]" value="<?php echo esc_attr( $type->name ); ?>" <?php checked( in_array( $type->name, $s['post_types'], true ) ); ?> /> <?php echo esc_html( $type->labels->name ); ?></label>
								<?php endforeach; ?>
							</fieldset>
						</td>
					</tr>
					<tr>
						<th scope="row"><?php esc_html_e( 'Kill verdicts', 'rankcall-gate' ); ?></th>
						<td>
							<label><input type="checkbox" name="<?php echo esc_attr( self::OPTION ); ?>[block_on_kill]" value="1" <?php checked( 1, (int) $s['block_on_kill'] ); ?> /> <?php esc_html_e( 'Block publishing when the verdict is Kill', 'rankcall-gate' ); ?></label>
							<p>
								<label for="rankcall-blocked-status"><?php esc_html_e( 'Keep blocked posts as', 'rankcall-gate' ); ?></label>
								<select id="rankcall-blocked-status" name="<?php echo esc_attr( self::OPTION ); ?>[blocked_status]">
									<option value="pending" <?php selected( 'pending', $s['blocked_status'] ); ?>><?php esc_html_e( 'Pending review', 'rankcall-gate' ); ?></option>
									<option value="draft" <?php selected( 'draft', $s['blocked_status'] ); ?>><?php esc_html_e( 'Draft', 'rankcall-gate' ); ?></option>
								</select>
							</p>
							<p class="description"><?php esc_html_e( 'If Rankcall cannot be reached, the post is published and the error is shown, so an outage never stops your site.', 'rankcall-gate' ); ?></p>
						</td>
					</tr>
				</table>
				<?php submit_button(); ?>
			</form>
		</div>
		<?php
	}

	// ---------------------------------------------------------------- the check

	/**
	 * Send one post to POST /api/v1/gate/check. Returns the stored result array (with 'error' set on failure).
	 *
	 * @param array $fields title, slug, content, excerpt, permalink, template.
	 */
	public static function check( array $fields ) {
		$s      = self::settings();
		$result = array(
			'checked_at' => time(),
			'verdict'    => null,
			'confidence' => null,
			'reasons'    => array(),
			'fixes'      => array(),
			'batch_url'  => '',
			'error'      => '',
		);
		if ( ! self::configured() ) {
			$result['error'] = __( 'Rankcall Gate is not set up yet (Settings, Rankcall Gate).', 'rankcall-gate' );
			return $result;
		}
		$body = array(
			'site'   => $s['site_id'],
			'source' => 'wordpress',
			'name'   => sprintf( 'WordPress: %s', wp_strip_all_tags( $fields['title'] ) ),
			'pages'  => array(
				array(
					'url'              => $fields['permalink'],
					'slug'             => $fields['slug'],
					'title'            => $fields['title'],
					'h1'               => $fields['title'],
					'body'             => $fields['content'],
					'meta_description' => $fields['excerpt'],
					'template'         => $fields['template'],
				),
			),
		);
		$response = wp_remote_post(
			$s['api_url'] . '/api/v1/gate/check',
			array(
				'timeout'     => self::TIMEOUT,
				'redirection' => 0,
				'headers'     => array(
					'Authorization' => 'Bearer ' . $s['api_key'],
					'Content-Type'  => 'application/json',
					'User-Agent'    => 'RankcallGate/' . self::VERSION . '; ' . home_url( '/' ),
				),
				'body'        => wp_json_encode( $body ),
			)
		);
		if ( is_wp_error( $response ) ) {
			/* translators: %s: error message from WordPress HTTP API */
			$result['error'] = sprintf( __( 'Rankcall could not be reached: %s', 'rankcall-gate' ), $response->get_error_message() );
			return $result;
		}
		$code = (int) wp_remote_retrieve_response_code( $response );
		$data = json_decode( wp_remote_retrieve_body( $response ), true );
		if ( 200 !== $code || ! is_array( $data ) || empty( $data['pages'][0] ) ) {
			$msg = is_array( $data ) && isset( $data['error'] ) && is_string( $data['error'] ) ? $data['error'] : __( 'Unexpected response.', 'rankcall-gate' );
			/* translators: 1: HTTP status code, 2: error message */
			$result['error'] = sprintf( __( 'Rankcall answered %1$d: %2$s', 'rankcall-gate' ), $code, $msg );
			return $result;
		}
		$page                 = $data['pages'][0];
		$verdict              = isset( $page['verdict'] ) ? (string) $page['verdict'] : '';
		$result['verdict']    = in_array( $verdict, array( 'index', 'improve', 'kill' ), true ) ? $verdict : null;
		$result['confidence'] = isset( $page['confidence'] ) ? (float) $page['confidence'] : null;
		$result['reasons']    = array_slice( array_map( 'strval', isset( $page['reasons'] ) && is_array( $page['reasons'] ) ? $page['reasons'] : array() ), 0, 5 );
		$result['fixes']      = array_slice( array_map( 'strval', isset( $page['fixes'] ) && is_array( $page['fixes'] ) ? $page['fixes'] : array() ), 0, 5 );
		$result['batch_url']  = isset( $data['url'] ) && is_string( $data['url'] ) && 0 === strpos( $data['url'], '/' ) ? $s['api_url'] . $data['url'] : '';
		if ( ! $result['verdict'] ) {
			$result['error'] = __( 'Rankcall did not return a verdict.', 'rankcall-gate' );
		}
		return $result;
	}

	private static function enabled_type( $type ) {
		return in_array( $type, self::settings()['post_types'], true );
	}

	private static function should_block( array $result ) {
		return 'kill' === $result['verdict'] && (int) self::settings()['block_on_kill'] === 1;
	}

	private static function template_for( $post_type, $page_template ) {
		$page_template = (string) $page_template;
		if ( '' !== $page_template && 'default' !== $page_template ) {
			return sanitize_title( $post_type . '-' . preg_replace( '/\.php$/', '', basename( $page_template ) ) );
		}
		return $post_type;
	}

	private static function fields_from_post( WP_Post $post ) {
		return array(
			'title'     => $post->post_title,
			'slug'      => $post->post_name ? $post->post_name : sanitize_title( $post->post_title ),
			'content'   => $post->post_content,
			'excerpt'   => $post->post_excerpt,
			'permalink' => (string) get_permalink( $post ),
			'template'  => self::template_for( $post->post_type, get_page_template_slug( $post ) ),
		);
	}

	/**
	 * Before a post is saved as published (editor, REST, Quick Edit), score it; on Kill with blocking on,
	 * save it as pending or draft instead, so it is never public.
	 */
	public static function before_save( $data, $postarr ) {
		if ( self::$updating || 'publish' !== $data['post_status'] || ! self::enabled_type( $data['post_type'] ) || ! self::configured() ) {
			return $data;
		}
		$id = isset( $postarr['ID'] ) ? (int) $postarr['ID'] : 0;
		if ( $id && ( wp_is_post_revision( $id ) || wp_is_post_autosave( $id ) || 'publish' === get_post_status( $id ) ) ) {
			return $data; // Only the move to published is gated; edits to live posts are not re-checked.
		}
		$slug   = $data['post_name'] ? $data['post_name'] : sanitize_title( wp_unslash( $data['post_title'] ) );
		$result = self::check(
			array(
				'title'     => wp_unslash( $data['post_title'] ),
				'slug'      => $slug,
				'content'   => wp_unslash( $data['post_content'] ),
				'excerpt'   => wp_unslash( $data['post_excerpt'] ),
				'permalink' => $id ? (string) get_permalink( $id ) : home_url( '/' . $slug . '/' ),
				'template'  => self::template_for( $data['post_type'], isset( $postarr['page_template'] ) ? $postarr['page_template'] : ( $id ? get_page_template_slug( $id ) : '' ) ),
			)
		);
		$result['blocked'] = self::should_block( $result );
		if ( $result['blocked'] ) {
			$data['post_status'] = self::settings()['blocked_status'];
		}
		self::$pending[ $id ] = $result;
		if ( $id ) {
			self::$checked[ $id ] = true;
		}
		return $data;
	}

	/** Store the pre-save result once the post has an ID, and queue the notice. */
	public static function after_save( $post_id, $post ) {
		$key = isset( self::$pending[ $post_id ] ) ? $post_id : ( isset( self::$pending[0] ) ? 0 : null );
		if ( null === $key ) {
			return;
		}
		$result = self::$pending[ $key ];
		unset( self::$pending[ $key ] );
		self::$checked[ $post_id ] = true;
		self::store( $post_id, $result );
	}

	/** Publishes that skip wp_insert_post_data (scheduled posts going live, wp_publish_post). */
	public static function on_transition( $new_status, $old_status, $post ) {
		if ( self::$updating || 'publish' !== $new_status || 'publish' === $old_status || ! $post instanceof WP_Post ) {
			return;
		}
		// A post checked by before_save in this request (a new post has no ID there yet, so it is held under 0).
		if ( isset( self::$checked[ $post->ID ] ) || isset( self::$pending[ $post->ID ] ) || isset( self::$pending[0] ) ) {
			return;
		}
		if ( ! self::enabled_type( $post->post_type ) || ! self::configured() || wp_is_post_revision( $post ) ) {
			return;
		}
		self::$checked[ $post->ID ] = true;
		$result            = self::check( self::fields_from_post( $post ) );
		$result['blocked'] = self::should_block( $result );
		if ( $result['blocked'] ) {
			self::$updating = true;
			wp_update_post(
				array(
					'ID'          => $post->ID,
					'post_status' => self::settings()['blocked_status'],
				)
			);
			self::$updating = false;
		}
		self::store( $post->ID, $result );
	}

	private static function store( $post_id, array $result ) {
		update_post_meta( $post_id, self::META, $result );
		$user = get_current_user_id();
		if ( $user ) {
			set_transient( self::NOTICE . $user, array( 'post' => (int) $post_id, 'result' => $result ), 10 * MINUTE_IN_SECONDS );
		}
	}

	// ---------------------------------------------------------------- editor UI

	public static function add_meta_box() {
		foreach ( self::settings()['post_types'] as $type ) {
			add_meta_box( 'rankcall-gate', __( 'Rankcall Quality Gate', 'rankcall-gate' ), array( __CLASS__, 'render_meta_box' ), $type, 'side', 'high' );
		}
	}

	public static function render_meta_box( $post ) {
		$result = get_post_meta( $post->ID, self::META, true );
		if ( is_array( $result ) && ( $result['verdict'] || $result['error'] ) ) {
			self::render_result( $result );
		} else {
			echo '<p>' . esc_html__( 'Not checked yet. Posts are checked when they are published.', 'rankcall-gate' ) . '</p>';
		}
		if ( ! self::configured() ) {
			if ( current_user_can( 'manage_options' ) ) {
				echo '<p><a href="' . esc_url( admin_url( 'options-general.php?page=rankcall-gate' ) ) . '">' . esc_html__( 'Set up Rankcall Gate', 'rankcall-gate' ) . '</a></p>';
			}
			return;
		}
		if ( 'auto-draft' === $post->post_status ) {
			echo '<p class="description">' . esc_html__( 'Save the draft first, then check it.', 'rankcall-gate' ) . '</p>';
			return;
		}
		$url = wp_nonce_url( admin_url( 'admin-post.php?action=rankcall_gate_check&post=' . (int) $post->ID ), 'rankcall_gate_check_' . $post->ID );
		echo '<p><a class="button" href="' . esc_url( $url ) . '">' . esc_html__( 'Check with Rankcall', 'rankcall-gate' ) . '</a></p>';
		echo '<p class="description">' . esc_html__( 'Checks the last saved version. Save your changes first.', 'rankcall-gate' ) . '</p>';
	}

	private static function verdict_label( $verdict ) {
		$labels = array(
			'index'   => __( 'Index', 'rankcall-gate' ),
			'improve' => __( 'Improve', 'rankcall-gate' ),
			'kill'    => __( 'Kill', 'rankcall-gate' ),
		);
		return isset( $labels[ $verdict ] ) ? $labels[ $verdict ] : '';
	}

	private static function render_result( array $result ) {
		if ( ! empty( $result['error'] ) ) {
			echo '<p><strong>' . esc_html__( 'Not checked:', 'rankcall-gate' ) . '</strong> ' . esc_html( $result['error'] ) . '</p>';
			return;
		}
		$colors = array( 'index' => '#1e7a46', 'improve' => '#8a5a00', 'kill' => '#b3261e' );
		$color  = isset( $colors[ $result['verdict'] ] ) ? $colors[ $result['verdict'] ] : '#1d2327';
		echo '<p><strong style="color:' . esc_attr( $color ) . '">' . esc_html( self::verdict_label( $result['verdict'] ) ) . '</strong>';
		if ( null !== $result['confidence'] ) {
			/* translators: %s: confidence between 0 and 1 */
			echo ' <span class="description">' . esc_html( sprintf( __( 'confidence %s', 'rankcall-gate' ), number_format_i18n( (float) $result['confidence'], 2 ) ) ) . '</span>';
		}
		echo '</p>';
		if ( ! empty( $result['reasons'] ) ) {
			echo '<ul style="list-style:disc;margin-left:1.2em">';
			foreach ( $result['reasons'] as $reason ) {
				echo '<li>' . esc_html( $reason ) . '</li>';
			}
			echo '</ul>';
		}
		if ( ! empty( $result['fixes'] ) ) {
			echo '<p><strong>' . esc_html__( 'Fixes', 'rankcall-gate' ) . '</strong></p><ul style="list-style:disc;margin-left:1.2em">';
			foreach ( $result['fixes'] as $fix ) {
				echo '<li>' . esc_html( $fix ) . '</li>';
			}
			echo '</ul>';
		}
		if ( ! empty( $result['batch_url'] ) ) {
			echo '<p><a href="' . esc_url( $result['batch_url'] ) . '" target="_blank" rel="noopener noreferrer">' . esc_html__( 'Open in Rankcall', 'rankcall-gate' ) . '</a></p>';
		}
		if ( ! empty( $result['checked_at'] ) ) {
			/* translators: %s: how long ago, e.g. "5 mins" */
			echo '<p class="description">' . esc_html( sprintf( __( 'Checked %s ago', 'rankcall-gate' ), human_time_diff( (int) $result['checked_at'] ) ) ) . '</p>';
		}
	}

	/** The "Check with Rankcall" button: nonce and capability checked, then back to the editor. */
	public static function handle_manual_check() {
		$post_id = isset( $_GET['post'] ) ? absint( $_GET['post'] ) : 0;
		check_admin_referer( 'rankcall_gate_check_' . $post_id );
		if ( ! $post_id || ! current_user_can( 'edit_post', $post_id ) ) {
			wp_die( esc_html__( 'You are not allowed to check this post.', 'rankcall-gate' ), '', array( 'response' => 403 ) );
		}
		$post = get_post( $post_id );
		if ( ! $post instanceof WP_Post ) {
			wp_die( esc_html__( 'Post not found.', 'rankcall-gate' ), '', array( 'response' => 404 ) );
		}
		$result            = self::check( self::fields_from_post( $post ) );
		$result['blocked'] = false; // A manual check never changes the post's status.
		self::store( $post_id, $result );
		wp_safe_redirect( get_edit_post_link( $post_id, 'url' ) );
		exit;
	}

	public static function show_notice() {
		$user = get_current_user_id();
		if ( ! $user ) {
			return;
		}
		$notice = get_transient( self::NOTICE . $user );
		if ( ! is_array( $notice ) || empty( $notice['result'] ) ) {
			return;
		}
		delete_transient( self::NOTICE . $user );
		$result = $notice['result'];
		$title  = get_the_title( (int) $notice['post'] );
		if ( ! empty( $result['error'] ) ) {
			$class = 'notice-warning';
		} elseif ( 'kill' === $result['verdict'] ) {
			$class = 'notice-error';
		} elseif ( 'improve' === $result['verdict'] ) {
			$class = 'notice-warning';
		} else {
			$class = 'notice-success';
		}
		echo '<div class="notice ' . esc_attr( $class ) . ' is-dismissible"><p><strong>' . esc_html__( 'Rankcall Quality Gate', 'rankcall-gate' ) . '</strong>: ';
		if ( ! empty( $result['blocked'] ) ) {
			/* translators: %s: post title */
			echo esc_html( sprintf( __( '“%s” was not published because the verdict is Kill. It is saved for review.', 'rankcall-gate' ), $title ) );
		} elseif ( ! empty( $result['error'] ) ) {
			echo esc_html( $result['error'] );
		} else {
			/* translators: 1: post title, 2: verdict */
			echo esc_html( sprintf( __( '“%1$s”: %2$s.', 'rankcall-gate' ), $title, self::verdict_label( $result['verdict'] ) ) );
		}
		echo '</p>';
		if ( empty( $result['error'] ) && ! empty( $result['reasons'] ) ) {
			echo '<ul style="list-style:disc;margin-left:1.5em">';
			foreach ( $result['reasons'] as $reason ) {
				echo '<li>' . esc_html( $reason ) . '</li>';
			}
			echo '</ul>';
		}
		echo '</div>';
	}
}

Rankcall_Gate::init();
