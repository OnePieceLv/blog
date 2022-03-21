// @ts-check
// Note: type annotations allow type checking and IDEs autocompletion

// const lightCodeTheme = require('prism-react-renderer/themes/github');
const darkCodeTheme = require('prism-react-renderer/themes/dracula');
// const palenightTheme = require('prism-react-renderer/themes/palenight');
// const vsDarkTheme = require('prism-react-renderer/themes/vsDark');
// const duotoneDarkTheme = require('prism-react-renderer/themes/duotoneDark');
// const oceanicNextTheme = require('prism-react-renderer/themes/oceanicNext');
// const synthwave84Theme = require('prism-react-renderer/themes/synthwave84');
// const okaidiaTheme = require('prism-react-renderer/themes/okaidia');
// const nightOwlTheme = require('prism-react-renderer/themes/nightOwl');
// const shadesOfPurpleTheme = require('prism-react-renderer/themes/shadesOfPurple');
// const ultraminTheme = require('prism-react-renderer/themes/ultramin');

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: "Morpheus Lv's Blog",
  tagline: '',
  url: 'https://lvwei.blog',
  baseUrl: '/',
  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',
  favicon: 'img/favicon.ico',
  organizationName: 'OnePieceLv', // Usually your GitHub org/user name.
  projectName: 'blog', // Usually your repo name.
  plugins: [
    "./postcss-tailwind-loader.js",
    //多文档配置 https://stackoverflow.com/a/60791656
  ],
  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          sidebarPath: require.resolve('./sidebars.js'),
          // Please change this to your repo.
          editUrl: 'https://github.com/facebook/docusaurus/tree/main/packages/create-docusaurus/templates/shared/',
        },
        blog: {
          showReadingTime: true,
          // Please change this to your repo.
          editUrl:
            'https://github.com/facebook/docusaurus/tree/main/packages/create-docusaurus/templates/shared/',
        },
        theme: {
          customCss: require.resolve('./src/css/custom.css'),
        },
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      navbar: {
        title: "Morpheus Lv's Blog",
        logo: {
          src: "https://cdn.ifun.pub/%E9%93%B6%E6%97%B6.jpg?roundPic/radius/400",
          width: 32,
          height: 32
        },
        items: [
          {
            type: 'doc',
            docId: 'intro',
            position: 'left',
            label: '进阶',
          },
          // {to: '/blog', label: 'Blog', position: 'left'},
          {
            type: 'dropdown',
            label: 'Github',
            position: 'left',
            items: [
              {
                label: 'NetService',
                href:'https://github.com/OnePieceLv/NetService',
              },
              {
                label: 'DispatchCenter',
                href:'https://github.com/OnePieceLv/DispatchCenter',
              },
              {
                label: 'TextKitAndAnimationEffect',
                href: 'https://github.com/OnePieceLv/TextKitAndAnimationEffect'
              },
              {
                label: 'UIStackLayoutView',
                href: 'https://github.com/OnePieceLv/UIStackLayoutView'
              }
            ]
          },
        ],
      },
      footer: {
        // style: 'dark',
        // links: [
        //   {
        //     title: 'Docs',
        //     items: [
        //       {
        //         label: 'Tutorial',
        //         to: '/docs/intro',
        //       },
        //     ],
        //   },
        //   {
        //     title: 'Community',
        //     items: [
        //       {
        //         label: 'Stack Overflow',
        //         href: 'https://stackoverflow.com/questions/tagged/docusaurus',
        //       },
        //       {
        //         label: 'Discord',
        //         href: 'https://discordapp.com/invite/docusaurus',
        //       },
        //       {
        //         label: 'Twitter',
        //         href: 'https://twitter.com/docusaurus',
        //       },
        //     ],
        //   },
        //   {
        //     title: 'More',
        //     items: [
        //       {
        //         label: 'Blog',
        //         to: '/blog',
        //       },
        //       {
        //         label: 'GitHub',
        //         href: 'https://github.com/facebook/docusaurus',
        //       },
        //     ],
        //   },
        // ],
        copyright: `<div>Copyright © ${new Date().getFullYear()} Lvwei's blog | <a href="https://beian.miit.gov.cn/#/Integrated/index">...</a></div>`,
      },
      prism: {
        theme: darkCodeTheme,
        // darkTheme: darkCodeTheme,
      },
      colorMode: {
        defaultMode: 'light',
        disableSwitch: true,
      }
    }),
};

module.exports = config;
