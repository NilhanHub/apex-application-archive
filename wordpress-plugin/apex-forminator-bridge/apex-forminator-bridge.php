<?php
/**
 * Plugin Name: Apex Forminator Bridge
 * Plugin URI:  https://apexhrm.com
 * Description: Exposes Apex job applications via authenticated WordPress REST endpoints.
 * Version:     2.0.0
 * Author:      Apex HRM
 * License:     Proprietary
 *
 * Endpoints (all require authentication + apex_export_forminator capability):
 *
 *   GET /wp-json/apex-forminator/v1/forms
 *   GET /wp-json/apex-forminator/v1/forms/{form_id}/entries
 *       ?page=1&per_page=50
 *   GET /wp-json/apex-forminator/v1/forms/{form_id}/entries/{entry_id}
 *
 * Authentication: WordPress Application Password (Basic auth header).
 * Unauthenticated or under-privileged requests receive HTTP 401/403.
 */

defined( 'ABSPATH' ) || exit;

define( 'AFB_EXPORT_CAPABILITY', 'apex_export_forminator' );
define( 'AFB_READER_ROLE', 'apex_archive_reader' );
define( 'AFB_JOB_APPLICATION_FORM_ID', 2989 );

register_activation_hook( __FILE__, 'afb_activate' );
add_action( 'init', 'afb_ensure_roles', 5 );
add_action( 'rest_api_init', 'afb_register_routes' );

/**
 * Create a least-privilege service role and keep administrators able to test it.
 */
function afb_activate() {
    afb_ensure_roles();
}

/**
 * Also runs after upgrades where the plugin activation hook may not fire.
 */
function afb_ensure_roles() {
    $reader = get_role( AFB_READER_ROLE );
    if ( ! $reader ) {
        $reader = add_role(
            AFB_READER_ROLE,
            'Apex Archive Reader',
            [
                'read'                  => true,
                AFB_EXPORT_CAPABILITY => true,
            ]
        );
    } elseif ( ! $reader->has_cap( AFB_EXPORT_CAPABILITY ) ) {
        $reader->add_cap( AFB_EXPORT_CAPABILITY );
    }

    $administrator = get_role( 'administrator' );
    if ( $administrator && ! $administrator->has_cap( AFB_EXPORT_CAPABILITY ) ) {
        $administrator->add_cap( AFB_EXPORT_CAPABILITY );
    }
}

function afb_register_routes() {
    $ns = 'apex-forminator/v1';

    // GET /forms
    register_rest_route( $ns, '/forms', [
        'methods'             => WP_REST_Server::READABLE,
        'callback'            => 'afb_get_forms',
        'permission_callback' => 'afb_permission',
    ] );

    // GET /forms/{form_id}/entries
    register_rest_route( $ns, '/forms/(?P<form_id>\d+)/entries', [
        'methods'             => WP_REST_Server::READABLE,
        'callback'            => 'afb_get_entries',
        'permission_callback' => 'afb_permission',
        'args'                => [
            'form_id' => [ 'required' => true, 'validate_callback' => 'afb_is_numeric_arg' ],
            'page'     => [ 'default' => 1,  'sanitize_callback' => 'absint' ],
            'per_page' => [ 'default' => 50, 'sanitize_callback' => 'absint' ],
        ],
    ] );

    // GET /forms/{form_id}/entries/{entry_id}
    register_rest_route( $ns, '/forms/(?P<form_id>\d+)/entries/(?P<entry_id>\d+)', [
        'methods'             => WP_REST_Server::READABLE,
        'callback'            => 'afb_get_entry',
        'permission_callback' => 'afb_permission',
        'args'                => [
            'form_id'  => [ 'required' => true, 'validate_callback' => 'afb_is_numeric_arg' ],
            'entry_id' => [ 'required' => true, 'validate_callback' => 'afb_is_numeric_arg' ],
        ],
    ] );
}

function afb_is_numeric_arg( $value, $request = null, $param = '' ) {
    return is_numeric( $value );
}

function afb_has_basic_auth(): bool {
    $headers = [
        $_SERVER['HTTP_AUTHORIZATION'] ?? '',
        $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '',
        $_SERVER['Authorization'] ?? '',
    ];

    if ( ! empty( $_SERVER['PHP_AUTH_USER'] ) ) {
        return true;
    }

    foreach ( $headers as $header ) {
        if ( is_string( $header ) && 0 === stripos( $header, 'Basic ' ) ) {
            return true;
        }
    }

    return false;
}

function afb_private_response( $data ) {
    $response = rest_ensure_response( $data );
    $response->header( 'Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0' );
    $response->header( 'Pragma', 'no-cache' );
    return $response;
}

/**
 * Permission callback: must be logged in and have the export capability.
 * Application Passwords satisfy the authentication step.
 */
function afb_permission( WP_REST_Request $request ) {
    if ( ! afb_has_basic_auth() ) {
        return new WP_Error( 'rest_not_logged_in', 'Application Password Basic authentication required.', [ 'status' => 401 ] );
    }
    if ( ! is_user_logged_in() ) {
        return new WP_Error( 'rest_not_logged_in', 'Authentication required.', [ 'status' => 401 ] );
    }
    if ( ! current_user_can( AFB_EXPORT_CAPABILITY ) ) {
        return new WP_Error( 'rest_forbidden', 'You do not have permission to access this endpoint.', [ 'status' => 403 ] );
    }
    return true;
}

/**
 * GET /forms
 * Returns all Forminator custom forms with id, title, and entry count.
 */
function afb_get_forms( WP_REST_Request $request ) {
    if ( ! class_exists( 'Forminator_API' ) ) {
        return new WP_Error( 'forminator_missing', 'Forminator plugin is not active.', [ 'status' => 503 ] );
    }

    $forms  = Forminator_API::get_forms( null, 1, 200 );
    $result = [];

    if ( is_array( $forms ) ) {
        foreach ( $forms as $form ) {
            $form_id  = isset( $form->id ) ? (int) $form->id : 0;
            if ( AFB_JOB_APPLICATION_FORM_ID !== $form_id ) {
                continue;
            }

            $count    = afb_entry_count( $form_id );
            $result[] = [
                'form_id'         => $form_id,
                'title'           => isset( $form->name ) ? $form->name : '',
                'entry_count'     => $count,
                'date_created'    => isset( $form->date_created ) ? $form->date_created : null,
                'date_updated'    => isset( $form->date_updated ) ? $form->date_updated : null,
            ];
        }
    }

    return afb_private_response( [ 'forms' => $result, 'total' => count( $result ) ] );
}

/**
 * GET /forms/{form_id}/entries
 * Returns paginated entries for a form.
 */
function afb_get_entries( WP_REST_Request $request ) {
    if ( ! class_exists( 'Forminator_API' ) ) {
        return new WP_Error( 'forminator_missing', 'Forminator plugin is not active.', [ 'status' => 503 ] );
    }

    $form_id  = (int) $request->get_param( 'form_id' );
    if ( AFB_JOB_APPLICATION_FORM_ID !== $form_id ) {
        return new WP_Error( 'form_not_allowed', 'This form is not available through the archive bridge.', [ 'status' => 404 ] );
    }

    $page     = max( 1, (int) $request->get_param( 'page' ) );
    $per_page = max( 1, min( (int) $request->get_param( 'per_page' ), 200 ) );

    $entries = Forminator_API::get_entries( $form_id, $per_page, $page );
    $total   = afb_entry_count( $form_id );

    if ( is_wp_error( $entries ) ) {
        return $entries;
    }

    $items = [];
    if ( is_array( $entries ) ) {
        foreach ( $entries as $entry ) {
            $items[] = afb_format_entry( $entry, $form_id );
        }
    }

    $response = afb_private_response( [
        'form_id'    => $form_id,
        'page'       => $page,
        'per_page'   => $per_page,
        'total'      => $total,
        'pages'      => $per_page > 0 ? (int) ceil( $total / $per_page ) : 1,
        'entries'    => $items,
    ] );

    $response->header( 'X-WP-Total',      $total );
    $response->header( 'X-WP-TotalPages', $per_page > 0 ? (int) ceil( $total / $per_page ) : 1 );
    return $response;
}

/**
 * GET /forms/{form_id}/entries/{entry_id}
 * Returns a single entry.
 */
function afb_get_entry( WP_REST_Request $request ) {
    if ( ! class_exists( 'Forminator_API' ) ) {
        return new WP_Error( 'forminator_missing', 'Forminator plugin is not active.', [ 'status' => 503 ] );
    }

    $form_id  = (int) $request->get_param( 'form_id' );
    if ( AFB_JOB_APPLICATION_FORM_ID !== $form_id ) {
        return new WP_Error( 'form_not_allowed', 'This form is not available through the archive bridge.', [ 'status' => 404 ] );
    }

    $entry_id = (int) $request->get_param( 'entry_id' );

    $entry = Forminator_API::get_entry( $form_id, $entry_id );

    if ( is_wp_error( $entry ) || ! $entry ) {
        return new WP_Error( 'entry_not_found', 'Entry not found.', [ 'status' => 404 ] );
    }

    return afb_private_response( afb_format_entry( $entry, $form_id ) );
}

/**
 * Normalize a Forminator entry object into a clean array.
 */
function afb_format_entry( $entry, int $form_id ) {
    $entry_id = isset( $entry->entry_id ) ? (int) $entry->entry_id : 0;
    $fields   = [];
    $files    = [];

    if ( ! empty( $entry->meta_data ) && is_array( $entry->meta_data ) ) {
        foreach ( $entry->meta_data as $key => $meta ) {
            $value = isset( $meta['value'] ) ? $meta['value'] : null;
            $fields[ $key ] = $value;

            afb_collect_files( $value, (string) $key, $files );
        }
    }

    $files   = afb_unique_files( $files );
    $cv_urls = array_values(
        array_unique(
            array_filter( array_column( $files, 'file_url' ) )
        )
    );

    return [
        'entry_id'     => $entry_id,
        'form_id'      => $form_id,
        'date_created' => isset( $entry->date_created ) ? $entry->date_created : null,
        'date_updated' => isset( $entry->date_updated ) ? $entry->date_updated : null,
        'is_read'      => isset( $entry->is_read )      ? (bool) $entry->is_read  : false,
        'fields'       => $fields,
        'files'        => $files,
        'cv_urls'      => $cv_urls,
    ];
}

/**
 * Recursively discover Forminator upload values such as upload-1.file.file_url.
 */
function afb_collect_files( $value, string $field_id, array &$files ) {
    if ( is_object( $value ) ) {
        $value = get_object_vars( $value );
    }

    if ( ! is_array( $value ) ) {
        return;
    }

    $url  = isset( $value['file_url'] ) && is_string( $value['file_url'] ) ? esc_url_raw( $value['file_url'] ) : '';
    $path = isset( $value['file_path'] ) && is_string( $value['file_path'] ) ? sanitize_text_field( $value['file_path'] ) : '';
    $name = isset( $value['file_name'] ) && is_string( $value['file_name'] ) ? sanitize_file_name( $value['file_name'] ) : '';

    if ( $url || $path || $name ) {
        $type    = wp_check_filetype( $name ?: wp_basename( $url ) );
        $files[] = [
            'field_id'  => sanitize_key( $field_id ),
            'file_name' => $name ?: sanitize_file_name( wp_basename( $url ) ),
            'file_path' => $path,
            'file_url'  => $url,
            'mime_type' => isset( $value['mime_type'] ) && is_string( $value['mime_type'] )
                ? sanitize_mime_type( $value['mime_type'] )
                : ( $type['type'] ?? '' ),
            'success'   => isset( $value['success'] ) ? (bool) $value['success'] : true,
            'message'   => isset( $value['message'] ) && is_string( $value['message'] )
                ? sanitize_text_field( $value['message'] )
                : '',
        ];
    }

    foreach ( $value as $child ) {
        afb_collect_files( $child, $field_id, $files );
    }
}

function afb_unique_files( array $files ): array {
    $unique = [];
    foreach ( $files as $file ) {
        $identity = $file['file_url'] ?: ( $file['file_path'] ?: $file['file_name'] );
        if ( ! $identity ) {
            continue;
        }
        $unique[ $identity ] = $file;
    }
    return array_values( $unique );
}

/**
 * Count all non-spam entries for the job application form.
 */
function afb_entry_count( int $form_id ): int {
    if ( class_exists( 'Forminator_API' ) ) {
        $entries = Forminator_API::get_entries( $form_id, 0, 1 );
        if ( is_array( $entries ) ) {
            return count( $entries );
        }
    }

    global $wpdb;
    $table = $wpdb->prefix . 'frmt_form_entry';
    if ( ! $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $table ) ) ) {
        return 0;
    }
    $sql = "SELECT COUNT(*) FROM {$table} WHERE form_id = %d AND is_spam = 0";
    return (int) $wpdb->get_var( $wpdb->prepare( $sql, $form_id ) );
}
