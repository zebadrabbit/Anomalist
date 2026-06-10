import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Anomalist',
  description: 'Self-hosted stream overlay control — open source alternative to Poltergeist',
  base: '/Anomalist/', // GitHub Pages subdirectory — change to '/' if using a custom domain

  head: [
    ['link', { rel: 'icon', href: '/Anomalist/favicon.ico' }],
  ],

  themeConfig: {
    logo: '/logo.png',
    siteTitle: 'Anomalist',

    nav: [
      { text: 'User Guide', link: '/guide/getting-started' },
      { text: 'Developer Docs', link: '/dev/architecture' },
      { text: 'GitHub', link: 'https://github.com/zebadrabbit/Anomalist' },
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Getting Started',
          items: [
            { text: 'Introduction', link: '/guide/introduction' },
            { text: 'Installation', link: '/guide/getting-started' },
            { text: 'First Run Setup', link: '/guide/first-run' },
          ],
        },
        {
          text: 'Dashboard',
          items: [
            { text: 'Canvas Editor', link: '/guide/canvas' },
            { text: 'Widgets', link: '/guide/widgets' },
            { text: 'Scenes', link: '/guide/scenes' },
            { text: 'Media Library', link: '/guide/media' },
            { text: 'Soundboard', link: '/guide/soundboard' },
          ],
        },
        {
          text: 'Twitch Integration',
          items: [
            { text: 'Connecting Twitch', link: '/guide/twitch' },
            { text: 'Chatbot Commands', link: '/guide/chatbot' },
            { text: 'Alerts', link: '/guide/alerts' },
          ],
        },
        {
          text: 'Users & Permissions',
          items: [
            { text: 'Roles', link: '/guide/roles' },
            { text: 'Managing Users', link: '/guide/users' },
          ],
        },
      ],
      '/dev/': [
        {
          text: 'Architecture',
          items: [
            { text: 'Overview', link: '/dev/architecture' },
            { text: 'Stack', link: '/dev/stack' },
            { text: 'Real-time Sync', link: '/dev/realtime' },
          ],
        },
        {
          text: 'Widget SDK',
          items: [
            { text: 'Building Widgets', link: '/dev/widget-sdk' },
            { text: 'Widget Types', link: '/dev/widget-types' },
            { text: 'Permissions', link: '/dev/permissions' },
          ],
        },
        {
          text: 'Contributing',
          items: [
            { text: 'Setup', link: '/dev/contributing' },
            { text: 'Roadmap', link: '/dev/roadmap' },
          ],
        },
      ],
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/zebadrabbit/Anomalist' },
    ],

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Community-maintained open source project',
    },

    search: {
      provider: 'local',
    },

    editLink: {
      pattern: 'https://github.com/zebadrabbit/Anomalist/edit/main/docs/:path',
      text: 'Edit this page on GitHub',
    },
  },

  markdown: {
    // Mermaid diagrams rendered natively
    config: (md) => {
      // additional markdown-it plugins can be added here
    },
  },
})
