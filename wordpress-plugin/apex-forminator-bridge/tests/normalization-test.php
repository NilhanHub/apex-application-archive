<?php
declare(strict_types=1);

define( 'ABSPATH', __DIR__ );

function register_activation_hook( $file, $callback ) {}
function add_action( $hook, $callback ) {}
function add_role( $role, $name, $capabilities ) {}
function get_role( $role ) { return null; }
function esc_url_raw( $value ) { return filter_var( $value, FILTER_SANITIZE_URL ); }
function sanitize_text_field( $value ) { return trim( strip_tags( $value ) ); }
function sanitize_file_name( $value ) { return preg_replace( '/[^A-Za-z0-9._ -]/', '', $value ); }
function sanitize_mime_type( $value ) { return preg_replace( '/[^A-Za-z0-9.+\/-]/', '', $value ); }
function sanitize_key( $value ) { return strtolower( preg_replace( '/[^A-Za-z0-9_-]/', '', $value ) ); }
function wp_basename( $value ) { return basename( parse_url( $value, PHP_URL_PATH ) ?: $value ); }
function wp_check_filetype( $name ) {
    $extension = strtolower( pathinfo( $name, PATHINFO_EXTENSION ) );
    return [ 'type' => $extension === 'pdf' ? 'application/pdf' : '' ];
}

require dirname( __DIR__ ) . '/apex-forminator-bridge.php';

function assert_true( $condition, string $message ): void {
    if ( ! $condition ) {
        fwrite( STDERR, "FAIL: {$message}\n" );
        exit( 1 );
    }
}

$entry = (object) [
    'entry_id' => 14,
    'date_created' => '2026-06-15 10:30:00',
    'date_updated' => '2026-06-15 10:35:00',
    'is_read' => false,
    'meta_data' => [
        'name-1' => [ 'value' => 'Jane Applicant' ],
        'upload-1' => [
            'value' => [
                'file' => [
                    'file_name' => 'Jane CV.pdf',
                    'file_path' => '/srv/uploads/Jane CV.pdf',
                    'file_url' => 'https://apexhrm.com/wp-content/uploads/forminator/Jane-CV.pdf',
                    'success' => true,
                ],
            ],
        ],
    ],
];

$normalized = afb_format_entry( $entry, 2989 );
assert_true( count( $normalized['files'] ) === 1, 'Nested Forminator upload should produce one canonical file.' );
assert_true( $normalized['files'][0]['field_id'] === 'upload-1', 'Canonical file should retain its source field.' );
assert_true( $normalized['files'][0]['file_name'] === 'Jane CV.pdf', 'Canonical file should retain its filename.' );
assert_true( $normalized['cv_urls'] === [ 'https://apexhrm.com/wp-content/uploads/forminator/Jane-CV.pdf' ], 'Legacy cv_urls should remain compatible.' );

fwrite( STDOUT, "PASS: WordPress upload normalization\n" );
