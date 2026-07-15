<?php
/**
 * Plugin Name: Apex Forminator Bridge
 * Plugin URI:  https://apexhrm.com
 * Description: Exposes Forminator submission data via authenticated WordPress REST endpoints for the Apex Archive local app.
 * Version:     1.0.0
 * Author:      Apex HRM
 * License:     Proprietary
 *
 * Endpoints (all require authentication + manage_options capability):
 *
 *   GET /wp-json/apex-forminator/v1/forms
 *   GET /wp-json/apex-forminator/v1/forms/{form_id}/entries
 *       ?page=1&per_page=50&after=YYYY-MM-DD
 *   GET /wp-json/apex-forminator/v1/forms/{form_id}/entries/{entry_id}
 *
 * Authentication: WordPress Application Password (Basic auth header).
 * Unauthenticated or under-privileged requests receive HTTP 401/403.
 */

defined( 'ABSPATH' ) || exit;

add_action( 'rest_api_init', 'afb_register_routes' );

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
            'after'    => [ 'default' => '', 'sanitize_callback' => 'sanitize_text_field' ],
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
 * Permission callback: must be logged in AND have manage_options.
 * Application Passwords satisfy the authentication step.
 */
function afb_permission( WP_REST_Request $request ) {
    if ( ! afb_has_basic_auth() ) {
        return new WP_Error( 'rest_not_logged_in', 'Application Password Basic authentication required.', [ 'status' => 401 ] );
    }
    if ( ! is_user_logged_in() ) {
        return new WP_Error( 'rest_not_logged_in', 'Authentication required.', [ 'status' => 401 ] );
    }
    if ( ! current_user_can( 'manage_options' ) ) {
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
    $page     = max( 1, (int) $request->get_param( 'page' ) );
    $per_page = max( 1, min( (int) $request->get_param( 'per_page' ), 200 ) );
    $after    = $request->get_param( 'after' );

    $entries = Forminator_API::get_entries( $form_id, $per_page, $page );
    $total   = afb_entry_count( $form_id, $after );

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
    $cv_urls  = [];

    if ( ! empty( $entry->meta_data ) && is_array( $entry->meta_data ) ) {
        foreach ( $entry->meta_data as $key => $meta ) {
            $value = isset( $meta['value'] ) ? $meta['value'] : null;
            $fields[ $key ] = $value;

            // Detect CV / file upload fields
            if ( is_string( $value ) && preg_match( '#wp-content/uploads/forminator/#i', $value ) ) {
                $cv_urls[] = $value;
            } elseif ( is_array( $value ) ) {
                foreach ( $value as $v ) {
                    if ( is_string( $v ) && preg_match( '#wp-content/uploads/forminator/#i', $v ) ) {
                        $cv_urls[] = $v;
                    }
                }
            }
        }
    }

    return [
        'entry_id'     => $entry_id,
        'form_id'      => $form_id,
        'date_created' => isset( $entry->date_created ) ? $entry->date_created : null,
        'date_updated' => isset( $entry->date_updated ) ? $entry->date_updated : null,
        'is_read'      => isset( $entry->is_read )      ? (bool) $entry->is_read  : false,
        'fields'       => $fields,
        'cv_urls'      => $cv_urls,
    ];
}

/**
 * Count entries for a form, optionally filtered by an after date.
 */
function afb_entry_count( int $form_id, string $after = '' ): int {
    if ( ! $after && class_exists( 'Forminator_API' ) ) {
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
    $params = [ $form_id ];
    if ( $after ) {
        $sql .= ' AND date_created >= %s';
        $params[] = $after;
    }
    return (int) $wpdb->get_var( $wpdb->prepare( $sql, ...$params ) );
}
