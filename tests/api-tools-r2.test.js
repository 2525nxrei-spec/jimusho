/**
 * テスト強化第2ラウンド: ツール系API（bunrei, calc, check, keiyaku, template）
 * これらはフロントエンドHTMLのみ（サーバーサイドAPIなし）だが、
 * 各ツールページのHTML存在確認と基本構造を検証する
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const PROJECT_ROOT = join(import.meta.dirname, '..');

describe('ツール系ディレクトリ — index.html存在確認', () => {
  const toolDirs = ['bunrei', 'calc', 'check', 'template'];

  for (const dir of toolDirs) {
    it(`${dir}/index.html が存在する`, () => {
      const filePath = join(PROJECT_ROOT, dir, 'index.html');
      expect(existsSync(filePath)).toBe(true);
    });
  }
});

describe('keiyaku — 全ページ存在確認', () => {
  const keiyakuPages = [
    'index.html',
    'app.html',
    'about.html',
    'contact.html',
    'privacy.html',
    'terms.html',
    'tokushoho.html',
  ];

  for (const page of keiyakuPages) {
    it(`keiyaku/${page} が存在する`, () => {
      const filePath = join(PROJECT_ROOT, 'keiyaku', page);
      expect(existsSync(filePath)).toBe(true);
    });
  }
});

describe('keiyaku — HTML基本構造', () => {
  it('keiyaku/index.html は有効なHTMLヘッダーを持つ', () => {
    const html = readFileSync(join(PROJECT_ROOT, 'keiyaku', 'index.html'), 'utf-8');
    expect(html).toContain('<!DOCTYPE html');
    expect(html).toContain('<html');
    expect(html).toContain('</html>');
    expect(html).toContain('<head');
    expect(html).toContain('</head>');
    expect(html).toContain('<body');
    expect(html).toContain('</body>');
  });

  it('keiyaku/app.html はアプリケーションページである', () => {
    const html = readFileSync(join(PROJECT_ROOT, 'keiyaku', 'app.html'), 'utf-8');
    expect(html).toContain('<!DOCTYPE html');
    expect(html).toContain('<html');
  });
});

describe('bunrei — サブディレクトリ構造確認', () => {
  it('bunrei/generators ディレクトリが存在する', () => {
    expect(existsSync(join(PROJECT_ROOT, 'bunrei', 'generators'))).toBe(true);
  });

  it('bunrei/pages ディレクトリが存在する', () => {
    expect(existsSync(join(PROJECT_ROOT, 'bunrei', 'pages'))).toBe(true);
  });

  it('bunrei/sitemap.xml が存在する', () => {
    expect(existsSync(join(PROJECT_ROOT, 'bunrei', 'sitemap.xml'))).toBe(true);
  });

  it('bunrei/robots.txt が存在する', () => {
    expect(existsSync(join(PROJECT_ROOT, 'bunrei', 'robots.txt'))).toBe(true);
  });
});

describe('calc — サブディレクトリ構造確認', () => {
  it('calc/calcs ディレクトリが存在する', () => {
    expect(existsSync(join(PROJECT_ROOT, 'calc', 'calcs'))).toBe(true);
  });

  it('calc/sitemap.xml が存在する', () => {
    expect(existsSync(join(PROJECT_ROOT, 'calc', 'sitemap.xml'))).toBe(true);
  });
});

describe('check — サブディレクトリ構造確認', () => {
  it('check/checklists ディレクトリが存在する', () => {
    expect(existsSync(join(PROJECT_ROOT, 'check', 'checklists'))).toBe(true);
  });

  it('check/sitemap.xml が存在する', () => {
    expect(existsSync(join(PROJECT_ROOT, 'check', 'sitemap.xml'))).toBe(true);
  });
});

describe('template — サブディレクトリ構造確認', () => {
  it('template/templates ディレクトリが存在する', () => {
    expect(existsSync(join(PROJECT_ROOT, 'template', 'templates'))).toBe(true);
  });

  it('template/sitemap.xml が存在する', () => {
    expect(existsSync(join(PROJECT_ROOT, 'template', 'sitemap.xml'))).toBe(true);
  });
});

describe('tools — 主要ツール存在確認', () => {
  const expectedTools = [
    'invoice-generator',
    'receipt-generator',
    'estimate-generator',
    'qr-generator',
    'password-generator',
    'text-counter',
    'image-compressor',
    'pdf-converter',
    'consumption-tax',
    'withholding-tax',
  ];

  for (const tool of expectedTools) {
    it(`tools/${tool} ディレクトリが存在する`, () => {
      expect(existsSync(join(PROJECT_ROOT, 'tools', tool))).toBe(true);
    });
  }
});

describe('メインサイト — 基本ファイル存在確認', () => {
  const requiredFiles = [
    'index.html',
    'manifest.json',
    'robots.txt',
    'sitemap.xml',
    '_headers',
    '_redirects',
    '404.html',
  ];

  for (const file of requiredFiles) {
    it(`${file} が存在する`, () => {
      expect(existsSync(join(PROJECT_ROOT, file))).toBe(true);
    });
  }
});

describe('manifest.json — 基本構造', () => {
  it('有効なJSONでname属性を持つ', () => {
    const content = readFileSync(join(PROJECT_ROOT, 'manifest.json'), 'utf-8');
    const manifest = JSON.parse(content);
    expect(manifest).toHaveProperty('name');
  });
});
