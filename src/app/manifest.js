export default function manifest() {
  return {
    name: 'Elixir Clinic',
    short_name: 'Elixir Clinic',
    start_url: '/',
    display: 'standalone',
    background_color: '#f7f0f4',
    theme_color: '#241c25',
    icons: [192, 512].map(size => ({
      src: `/elixirclinic-web-icon-${size}.png`,
      sizes: `${size}x${size}`,
      type: 'image/png',
    })),
  };
}
