import { cpSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const outDir = join(root, 'release', 'discovery_queue');

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

cpSync(join(root, 'plugin.json'), join(outDir, 'plugin.json'));
cpSync(join(root, '.millennium'), join(outDir, '.millennium'), { recursive: true });

function getSize(dir) {
	let total = 0;
	const stack = [dir];

	while (stack.length) {
		const current = stack.pop();
		if (!current) {
			continue;
		}

		for (const entry of readdirSync(current, { withFileTypes: true })) {
			const full = join(current, entry.name);
			if (entry.isDirectory()) {
				stack.push(full);
			} else {
				total += statSync(full).size;
			}
		}
	}

	return total;
}

const kb = Math.round(getSize(outDir) / 1024);
console.log(`Packaged to release/discovery_queue (${kb} KB)`);
console.log('Copy release/discovery_queue to <Steam>/plugins/ — do NOT copy node_modules.');
