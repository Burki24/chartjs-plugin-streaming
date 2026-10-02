// This unpublished fork has one development site, not npm-versioned documentation.
const BASE = '/chartjs-plugin-streaming/';
const REPO_NAME = 'Burki24/chartjs-plugin-streaming';
const REPO_URL = `https://github.com/${REPO_NAME}`;
const developmentMenu = locale => ({
  text: 'Development (dev)',
  items: [
    {text: 'Documentation', link: `${locale}guide/`},
    {text: 'Source (dev)', link: `${REPO_URL}/tree/dev`},
    {text: 'Releases', link: `${REPO_URL}/releases`}
  ]
});

module.exports = {
  dest: 'dist/docs',
  theme: 'chartjs',
  title: 'chartjs-plugin-streaming',
  base: BASE,
  head: [
    ['link', {rel: 'icon', href: '/logo.png'}]
  ],
  locales: {
    '/': {
      lang: 'en-US',
      description: 'Chart.js plugin for live streaming data'
    },
    '/ja/': {
      lang: 'ja-JP',
      description: 'リアルタイムストリーミングデータ向け Chart.js プラグイン'
    }
  },
  plugins: [
    ['flexsearch'],
    ['@vuepress/html-redirect', {
      countdown: 0
    }],
    ['redirect', {
      redirectors: [
        {base: '/tutorials', alternative: ['plainjs/scripts']},
        {base: '/samples', alternative: ['charts/line-horizontal']},
        {base: '/ja/tutorials', alternative: ['plainjs/scripts']},
        {base: '/ja/samples', alternative: ['charts/line-horizontal']}
      ]
    }]
  ],
  chainWebpack: (config) => {
    // Terser 1's optional disk cache still hashes with native MD4. Keep
    // minification enabled, but disable this cache on the Node 24 toolchain.
    config.optimization.minimizer('terser')
      .use(require('terser-webpack-plugin'), [{cache: false, parallel: 2}]);
    // Webpack 4 cannot parse Chart.js 4 class fields. Transpile only this
    // dependency for the documentation bundle; shipped plugin files stay intact.
    config.module.rule('chartjs')
      .test(/\.js$/)
      .include.add(/node_modules[\\/]chart\.js[\\/]/).end()
      .use('babel-loader')
      .loader(require.resolve('babel-loader'))
      .options({
        babelrc: false,
        configFile: false,
        presets: [[require.resolve('@babel/preset-env'), {targets: {chrome: '64'}, modules: false}]]
      });
    config.merge({
      resolve: {
        alias: {
          // Webpack 4 does not resolve this package's exports-only entry point.
          'chartjs-adapter-luxon$': require.resolve('chartjs-adapter-luxon'),
          // Hammerjs requires window, using ng-hammerjs instead
          'hammerjs': 'ng-hammerjs'
        }
      }
    });
  },
  themeConfig: {
    repo: REPO_NAME,
    docsDir: 'docs',
    docsBranch: 'dev',
    editLinks: true,
    logo: '/logo.png',
    searchPlaceholder: 'Search...',
    chart: {
      imports: [
        ['scripts/chartjs-chart-financial.js'],
        ['scripts/register.js'],
        ['scripts/utils.js', 'Utils']
      ]
    },
    locales: {
      '/': {
        label: 'English',
        selectText: 'Languages',
        editLinkText: 'Edit this page',
        lastUpdated: 'Last Updated',
        nav: [
          {text: 'Home', link: '/'},
          {text: 'Guide', link: '/guide/'},
          {text: 'Tutorials', link: '/tutorials/'},
          {text: 'Samples', link: '/samples/'},
          developmentMenu('/')
        ],
        sidebar: {
          '/guide/': [
            '',
            'getting-started',
            'options',
            'data-feed-models',
            'integration',
            'performance',
            'migration'
          ],
          '/tutorials/': [
            {
              title: 'Plain JS',
              children: [
                'plainjs/scripts',
                'plainjs/canvas',
                'plainjs/chart',
                'plainjs/stream',
                'plainjs/delay',
                'plainjs/color'
              ]
            },
            {
              title: 'Angular 2+',
              children: [
                'angular/app',
                'angular/install',
                'angular/import',
                'angular/canvas',
                'angular/chart',
                'angular/stream'
              ]
            },
            {
              title: 'React',
              children: [
                'react/app',
                'react/install',
                'react/chart',
                'react/stream'
              ]
            },
            {
              title: 'Vue',
              children: [
                'vue/app',
                'vue/install',
                'vue/main',
                'vue/chart',
                'vue/stream'
              ]
            }
          ],
          '/samples/': [
            {
              title: 'Charts',
              children: [
                'charts/line-horizontal',
                'charts/line-vertical',
                'charts/bar-horizontal',
                'charts/bar-vertical',
                'charts/mixed-horizontal',
                'charts/mixed-vertical',
                'charts/bubble-horizontal',
                'charts/bubble-vertical'
              ]
            },
            {
              title: 'Integration',
              children: [
                'integration/datalabels',
                'integration/annotation',
                'integration/zoom',
                'integration/financial'
              ]
            },
            {
              title: 'Advanced',
              children: [
                'advanced/interactions',
                'advanced/reverse',
                'advanced/push'
              ]
            }
          ]
        }
      },
      '/ja/': {
        label: '日本語',
        selectText: '言語',
        editLinkText: 'このページを編集',
        lastUpdated: '最終更新日時',
        nav: [
          {text: 'ホーム', link: '/ja/'},
          {text: 'ガイド', link: '/ja/guide/'},
          {text: 'チュートリアル', link: '/ja/tutorials/'},
          {text: 'サンプル', link: '/ja/samples/'},
          developmentMenu('/ja/')
        ],
        sidebar: {
          '/ja/guide/': [
            '',
            'getting-started',
            'options',
            'data-feed-models',
            'integration',
            'performance',
            'migration'
          ],
          '/ja/tutorials/': [
            {
              title: 'プレーン JS',
              children: [
                'plainjs/scripts',
                'plainjs/canvas',
                'plainjs/chart',
                'plainjs/stream',
                'plainjs/delay',
                'plainjs/color'
              ]
            },
            {
              title: 'Angular 2+',
              children: [
                'angular/app',
                'angular/install',
                'angular/import',
                'angular/canvas',
                'angular/chart',
                'angular/stream'
              ]
            },
            {
              title: 'React',
              children: [
                'react/app',
                'react/install',
                'react/chart',
                'react/stream'
              ]
            },
            {
              title: 'Vue',
              children: [
                'vue/app',
                'vue/install',
                'vue/main',
                'vue/chart',
                'vue/stream'
              ]
            }
          ],
          '/ja/samples/': [
            {
              title: 'チャート',
              children: [
                'charts/line-horizontal',
                'charts/line-vertical',
                'charts/bar-horizontal',
                'charts/bar-vertical',
                'charts/mixed-horizontal',
                'charts/mixed-vertical',
                'charts/bubble-horizontal',
                'charts/bubble-vertical'
              ]
            },
            {
              title: '連携',
              children: [
                'integration/datalabels',
                'integration/annotation',
                'integration/zoom',
                'integration/financial'
              ]
            },
            {
              title: 'その他',
              children: [
                'advanced/interactions',
                'advanced/reverse',
                'advanced/push'
              ]
            }
          ]
        }
      }
    }
  }
};
