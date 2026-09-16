import { defineConfig } from 'vitepress'

const repo = 'https://github.com/WuCheng-cn/FreeFish'

export default defineConfig({
  base: '/FreeFish/',
  cleanUrls: true,
  lastUpdated: true,
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/FreeFish/logo.svg' }],
    ['meta', { name: 'theme-color', content: '#16181d' }]
  ],
  locales: {
    root: {
      label: '简体中文',
      lang: 'zh-CN',
      title: 'FreeFish',
      description: '轻量、隐蔽的跨平台悬浮 TXT 阅读器'
    },
    en: {
      label: 'English',
      lang: 'en-US',
      link: '/en/',
      title: 'FreeFish',
      description: 'A lightweight, discreet floating TXT reader'
    }
  },
  themeConfig: {
    logo: '/logo.svg',
    socialLinks: [{ icon: 'github', link: repo }],
    search: { provider: 'local' },
    locales: {
      root: {
        label: '简体中文',
        nav: [
          { text: '指南', link: '/guide/getting-started' },
          { text: '下载', link: '/download' },
          { text: 'GitHub', link: repo }
        ],
        sidebar: {
          '/guide/': [
            {
              text: '使用指南',
              items: [
                { text: '安装与快速开始', link: '/guide/getting-started' },
                { text: '功能与快捷键', link: '/guide/usage' }
              ]
            }
          ]
        },
        outline: { label: '本页目录' },
        lastUpdated: { text: '最后更新于' },
        docFooter: { prev: '上一页', next: '下一页' },
        returnToTopLabel: '回到顶部',
        sidebarMenuLabel: '目录',
        darkModeSwitchLabel: '外观'
      },
      en: {
        label: 'English',
        nav: [
          { text: 'Guide', link: '/en/guide/getting-started' },
          { text: 'Download', link: '/en/download' },
          { text: 'GitHub', link: repo }
        ],
        sidebar: {
          '/en/guide/': [
            {
              text: 'User guide',
              items: [
                { text: 'Install and get started', link: '/en/guide/getting-started' },
                { text: 'Features and shortcuts', link: '/en/guide/usage' }
              ]
            }
          ]
        }
      }
    },
    editLink: {
      pattern: `${repo}/edit/master/docs/:path`,
      text: '在 GitHub 上编辑此页'
    },
    footer: {
      message: 'FreeFish · SysNotes',
      copyright: 'Built with Tauri and VitePress'
    }
  }
})
