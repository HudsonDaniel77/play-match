import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { app } from '../app.js';
import { generateOpenAPISpec } from './generate-openapi.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const specPath = path.resolve(__dirname, '../../openapi.json');

export function extractExpressRoutes(expressApp: any): Array<{ method: string; path: string }> {
  const routes: Array<{ method: string; path: string }> = [];

  function cleanPrefix(regexSource: string, keys: any[] = []): string {
    let cleaned = regexSource
      .replace(/^\^\\?/, '')
      .replace(/\\\/\?\(\?=\\\/\|\$\)$/, '')
      .replace(/\/\?\(\?=\/\|\$\)$/, '')
      .replace('\\/?(?=\\/|$)', '')
      .replace(/\\\//g, '/')
      .replace(/\\\?/g, '?');

    if (keys && keys.length > 0) {
      let keyIdx = 0;
      cleaned = cleaned.replace(/\(\?:\/\(\[\^\/\]\+\?\)\)/g, () => {
        const k = keys[keyIdx++];
        return k ? `/:${k.name}` : '';
      });
      cleaned = cleaned.replace(/\(\[\^\/\]\+\?\)/g, () => {
        const k = keys[keyIdx++];
        return k ? `:${k.name}` : '';
      });
    }

    return cleaned
      .replace(/\(\?:\([^)]+\)\)\?/g, '')
      .replace(/\?$/, '');
  }

  function walkStack(stack: any[], currentPrefix = '') {
    for (const layer of stack) {
      if (layer.route && layer.route.path) {
        const methods = Object.keys(layer.route.methods || {}).filter(
          (m) => layer.route.methods[m],
        );
        for (const m of methods) {
          let fullPath = (currentPrefix + layer.route.path).replace(/\/+/g, '/');
          if (fullPath.length > 1 && fullPath.endsWith('/')) {
            fullPath = fullPath.slice(0, -1);
          }
          routes.push({
            method: m.toUpperCase(),
            path: fullPath,
          });
        }
      } else if (layer.name === 'router' && layer.handle && layer.handle.stack) {
        let prefixSegment = '';
        if (layer.regexp) {
          prefixSegment = cleanPrefix(layer.regexp.source, layer.keys);
          if (prefixSegment && !prefixSegment.startsWith('/')) {
            prefixSegment = '/' + prefixSegment;
          }
        }
        walkStack(layer.handle.stack, currentPrefix + prefixSegment);
      }
    }
  }

  if (expressApp._router && expressApp._router.stack) {
    walkStack(expressApp._router.stack);
  }

  return routes;
}

export function normalizeOpenApiPath(openApiPath: string): string {
  // Convert {param} to :param for matching Express paths
  return openApiPath.replace(/\{([^}]+)\}/g, ':$1');
}

export function checkOpenAPIDrift(): {
  isUpToDate: boolean;
  missingFromSpec: Array<{ method: string; path: string }>;
  driftDetected: boolean;
} {
  if (!fs.existsSync(specPath)) {
    throw new Error(`OpenAPI spec not found at ${specPath}. Run 'npm run openapi:export' first.`);
  }

  const existingFileContent = fs.readFileSync(specPath, 'utf-8');
  const freshGeneratedSpec = generateOpenAPISpec();
  const freshSpecString = JSON.stringify(freshGeneratedSpec, null, 2) + '\n';

  const driftDetected = existingFileContent !== freshSpecString;

  // Walk express routes and compare
  const expressRoutes = extractExpressRoutes(app);
  const specPaths = Object.keys(freshGeneratedSpec.paths);

  const missingFromSpec: Array<{ method: string; path: string }> = [];

  for (const route of expressRoutes) {
    const matchingPath = specPaths.find((sp) => {
      const normalizedSp = normalizeOpenApiPath(sp);
      return normalizedSp === route.path;
    });

    if (!matchingPath) {
      missingFromSpec.push(route);
    } else {
      const pathItem = (freshGeneratedSpec.paths as any)[matchingPath];
      const methodKey = route.method.toLowerCase();
      if (!pathItem || !pathItem[methodKey]) {
        missingFromSpec.push(route);
      }
    }
  }

  return {
    isUpToDate: !driftDetected && missingFromSpec.length === 0,
    missingFromSpec,
    driftDetected,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = checkOpenAPIDrift();
  if (!result.isUpToDate) {
    console.error('OpenAPI drift check failed!');
    if (result.driftDetected) {
      console.error('- Spec file on disk does not match generator output. Run `npm run openapi:export`.');
    }
    if (result.missingFromSpec.length > 0) {
      console.error('- Express routes missing from OpenAPI spec:');
      for (const missing of result.missingFromSpec) {
        console.error(`  * ${missing.method} ${missing.path}`);
      }
    }
    process.exit(1);
  } else {
    console.log('OpenAPI spec is perfectly synchronized with Express routes!');
  }
}
