/**
 * Auto-generates an OpenAPI spec from the SvelteKit route tree.
 *
 * Scans all +server.ts files under src/routes/api/ for exported HTTP methods and
 * builds a minimal OpenAPI 3.1 spec at static/.well-known/openapi.json.
 *
 * Usage: npx tsx scripts/generate-openapi.ts
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'fs';
import { resolve, relative, dirname, join } from 'path';

const ROOT = process.cwd();
const ROUTES_DIR = resolve(ROOT, 'src/routes/api');
const OUTPUT = resolve(ROOT, 'static/api/openapi.json');

const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf-8'));

function walkDir(dir: string): string[] {
	const results: string[] = [];
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) {
			results.push(...walkDir(full));
		} else if (entry === '+server.ts') {
			results.push(full);
		}
	}
	return results;
}

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
const METHOD_RE = new RegExp(`export\\s+const\\s+(${HTTP_METHODS.join('|')})`, 'g');

function svelteKitPathToOpenAPI(filePath: string): string {
	const rel = relative(ROUTES_DIR, dirname(filePath));
	const segments = rel === '' ? [] : rel.split('/');
	const apiPath =
		'/api/' +
		segments
			.map((s) => {
				const match = s.match(/^\[(.+)\]$/);
				return match ? `{${match[1]}}` : s;
			})
			.join('/');
	return apiPath;
}

function extractMethods(filePath: string): string[] {
	const content = readFileSync(filePath, 'utf-8');
	const methods: string[] = [];
	let match;
	while ((match = METHOD_RE.exec(content)) !== null) {
		methods.push(match[1].toLowerCase());
	}
	METHOD_RE.lastIndex = 0;
	return methods;
}

function inferTag(path: string): string {
	const first = path.replace('/api/', '').split('/')[0];
	return first.charAt(0).toUpperCase() + first.slice(1);
}

function extractPathParams(path: string) {
	const params: { name: string; in: string; required: boolean; schema: { type: string } }[] = [];
	const re = /\{(\w+)\}/g;
	let match;
	while ((match = re.exec(path)) !== null) {
		params.push({ name: match[1], in: 'path', required: true, schema: { type: 'string' } });
	}
	return params;
}

const files = walkDir(ROUTES_DIR);
const paths: Record<string, Record<string, unknown>> = {};

for (const fullPath of files) {
	const apiPath = svelteKitPathToOpenAPI(fullPath);
	const methods = extractMethods(fullPath);

	if (methods.length === 0) continue;

	const pathParams = extractPathParams(apiPath);
	const pathEntry: Record<string, unknown> = {};

	if (pathParams.length > 0) {
		pathEntry.parameters = pathParams;
	}

	for (const method of methods) {
		const operation: Record<string, unknown> = {
			tags: [inferTag(apiPath)],
			responses: {
				'200': { description: 'Success' }
			}
		};

		if (['post', 'put', 'patch'].includes(method)) {
			operation.requestBody = {
				content: {
					'application/json': {
						schema: { type: 'object' }
					}
				}
			};
		}

		pathEntry[method] = operation;
	}

	paths[apiPath] = pathEntry;
}

const sortedPaths: Record<string, Record<string, unknown>> = {};
for (const key of Object.keys(paths).sort()) {
	sortedPaths[key] = paths[key];
}

const spec = {
	openapi: '3.1.0',
	info: {
		title: `${pkg.name.charAt(0).toUpperCase() + pkg.name.slice(1)} API`,
		description: `Auto-generated API spec for ${pkg.name}`,
		version: pkg.version,
		contact: {
			name: 'Bretzel',
			url: 'https://bretzel.app'
		}
	},
	servers: [{ url: '/', description: 'Current instance' }],
	security: [{ sessionCookie: [] }],
	paths: sortedPaths,
	components: {
		securitySchemes: {
			sessionCookie: {
				type: 'apiKey',
				in: 'cookie',
				name: 'session'
			}
		}
	}
};

mkdirSync(dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, JSON.stringify(spec, null, 2) + '\n');
console.log(`Generated ${relative(ROOT, OUTPUT)} with ${Object.keys(paths).length} paths`);
