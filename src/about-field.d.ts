/*
 * Stoatworks Labs - types for about-field.js.
 *
 * Vendored alongside it by ../../scripts/sync-about.py. Only the one TypeScript
 * module in the fleet (companion-module-animatem) needs this; the rest are
 * plain ESM and ignore it. Keeping one implementation and declaring it beats
 * a second copy written in TypeScript.
 */

import type { CompanionStaticTextInputField } from '@companion-module/base'

export declare function aboutField(options?: {
	name?: string
	id?: string
}): CompanionStaticTextInputField
