/**
 * Stoatworks Labs - the About block for a Companion module.
 *
 * This file is the MASTER, in stoatworks-backend/about/companion. It is
 * vendored into each companion-module-* repo by ../../scripts/sync-about.py -
 * edit it HERE and re-run the sync, never the copies.
 *
 * ---------------------------------------------------- why this is not a window
 *
 * A Companion module has no UI of its own. It runs headless inside Companion
 * and the only surface it can draw on is its own connection config panel, which
 * Companion renders from `getConfigFields()`. So the About block here is a
 * `static-text` field: Companion renders its `value` as HTML, which is enough
 * for the version and a line of links, and is the whole of what is available.
 *
 * ------------------------------------------------------------------ using it
 *
 * Append it to whatever getConfigFields() already returns:
 *
 *     import { aboutField } from './about-field.js'
 *     ...
 *     getConfigFields() {
 *       return [
 *         ...,
 *         aboutField(),
 *       ]
 *     }
 *
 * ------------------------------------------------------------- the facts
 *
 * Read from the module's own files, which Companion already requires to be
 * accurate: the product name from companion/manifest.json (`shortname` is the
 * one with the real capitalisation - `name` is the lowercase id, and the
 * package name is `companion-module-<id>`), the version and the repo URL from
 * package.json. Nothing is written down twice, and there is no generated data
 * file for these: unlike the applications, a Companion module has no separate
 * product page of its own.
 */

import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

/** The canonical set, matching stoatworks-backend/funding/FUNDING.yml. */
const FUNDING = [
	['GitHub Sponsors', 'https://github.com/sponsors/stoatworks-labs'],
	['Ko-fi', 'https://ko-fi.com/stoatworkslabs'],
	['Patreon', 'https://patreon.com/StoatworksLabs'],
	['Liberapay', 'https://liberapay.com/stoatworks-labs'],
]

const HOME = 'https://stoatworks-labs.com'

/**
 * Pull the repo URL out of whatever shape package.json uses for it - a string,
 * or an object with a `url` that may carry a `git+` prefix and a `.git` suffix.
 */
function repoUrl(pkg) {
	const raw = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url
	if (!raw) return ''
	return raw
		.replace(/^git\+/, '')
		.replace(/\.git$/, '')
		.replace(/^git@github\.com:/, 'https://github.com/')
}

function link(url, text) {
	return `<a href="${url}" target="_blank" rel="noopener">${text}</a>`
}

/**
 * The About block, as a Companion config field.
 *
 * @param {object} [options]
 * @param {string} [options.name] Product name; defaults to the package's own.
 * @param {string} [options.id] Field id, if `about` collides with something.
 * @returns {object} A `static-text` field to append to getConfigFields().
 */
export function aboutField(options = {}) {
	// Relative to this file, so it finds the module's package.json wherever the
	// module is installed rather than whatever cwd Companion happens to have.
	const pkg = require('../package.json')

	// shortname, not name: manifest `name` is the lowercase connection id, so
	// using it would put "simplecue" and "weblinked" in front of the user
	// instead of SimpleCue and WebLinked.
	let name = options.name
	if (!name) {
		try {
			const manifest = require('../companion/manifest.json')
			name = manifest.shortname || manifest.products?.[0] || manifest.name
		} catch {
			name = pkg.name.replace(/^companion-module-/, '')
		}
	}

	const repo = repoUrl(pkg)

	const rows = []
	if (repo) rows.push(link(repo, 'Source on GitHub'))
	rows.push(link(HOME, 'Stoatworks Labs'))

	const funding = FUNDING.map(([label, url]) => link(url, label)).join(' &middot; ')

	return {
		type: 'static-text',
		id: options.id || 'about',
		width: 12,
		label: 'About',
		value:
			`<b>${name}</b> v${pkg.version} &mdash; ${rows.join(' &middot; ')}<br>` +
			`This module is free and open source. If it is useful to you, ` +
			`supporting the work keeps it coming: ${funding}.`,
	}
}
