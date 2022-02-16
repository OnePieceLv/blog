const colors = require('tailwindcss/colors')

module.exports = {
  content: ["./src/**/*.{html,js,ts,tsx}"],
  theme: {
    screens: {
      'sm': '640px',
      'md': '768px',
      'lg': '1024px',
      'xl': '1280px',
      '2xl': '1536px',
    },
    container: {
      center: true,
    },
    backgroundImage: {
      'contribution': "url('/assets/contribution.png')",
    },
    colors: {
      kratos: {
        400: "#38bdf3",
        500: "#23ade5",
      },
      transparent: 'transparent',
      current: 'currentColor',
      black: colors.black,
      white: colors.white,
      gray: colors.neutral,
      indigo: colors.indigo,
      red: colors.rose,
      yellow: colors.amber,
    },
    extend: {},
  },
  plugins: [],
}
