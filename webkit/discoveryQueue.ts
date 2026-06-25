export interface PluginConfig {
	queueRuns: number;
	autoRunOnExplore: boolean;
	claimStickers: boolean;
	autoSkipInQueue: boolean;
	notifyRewards: boolean;
}

export const DEFAULT_CONFIG: PluginConfig = {
	queueRuns: 3,
	autoRunOnExplore: false,
	claimStickers: true,
	autoSkipInQueue: true,
	notifyRewards: true,
};

export interface RewardStatus {
	loggedIn: boolean;
	queueCount: number;
	canClaimSticker: boolean;
}

export interface RunResult {
	success: boolean;
	queuesCompleted: number;
	itemsSkipped: number;
	stickerClaimed: boolean;
	message: string;
}

declare global {
	interface Window {
		g_sessionID?: string;
		ShowConfirmDialog?: (
			title: string,
			body: string,
			ok?: string,
			cancel?: string,
		) => { done: (cb: () => void) => void };
		ShowBlockingWaitDialog?: (title: string, body: string) => { Dismiss: () => void };
	}
}

export function getSessionId(): string | null {
	if (typeof window.g_sessionID === 'string' && window.g_sessionID.length > 0) {
		return window.g_sessionID;
	}

	const input = document.querySelector<HTMLInputElement>('input[name="sessionid"]');
	if (input?.value) {
		return input.value;
	}

	const match = document.cookie.match(/(?:^|;\s*)sessionid=([^;]+)/);
	return match?.[1] ?? null;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function decodeVarint(bytes: Uint8Array, start: number): [number, number] {
	let value = 0;
	let shift = 0;
	let index = start;

	while (index < bytes.length) {
		const byte = bytes[index++];
		value |= (byte & 0x7f) << shift;
		if ((byte & 0x80) === 0) {
			break;
		}
		shift += 7;
	}

	return [value, index];
}

function decodeCanClaimItem(data: ArrayBuffer): { canClaim: boolean; nextClaimTime?: number } {
	const bytes = new Uint8Array(data);
	let canClaim = false;
	let nextClaimTime: number | undefined;
	let index = 0;

	while (index < bytes.length) {
		const tag = bytes[index++];

		if (tag === 0x08) {
			canClaim = bytes[index++] === 1;
		} else if (tag === 0x10) {
			[nextClaimTime, index] = decodeVarint(bytes, index);
		} else {
			break;
		}
	}

	return { canClaim, nextClaimTime };
}

async function postForm(url: string, fields: Record<string, string>): Promise<Response> {
	const body = new URLSearchParams(fields);
	return fetch(url, {
		method: 'POST',
		credentials: 'include',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
		},
		body: body.toString(),
	});
}

async function generateQueue(sessionId: string, queueType = 0): Promise<number[]> {
	const response = await postForm('https://store.steampowered.com/explore/generatenewdiscoveryqueue', {
		sessionid: sessionId,
		queuetype: String(queueType),
	});

	if (!response.ok) {
		throw new Error(`Failed to generate queue (HTTP ${response.status})`);
	}

	const data = (await response.json()) as { queue?: number[] };
	if (!Array.isArray(data.queue) || data.queue.length === 0) {
		throw new Error('Steam returned an empty discovery queue');
	}

	return data.queue;
}

async function skipQueueItem(sessionId: string, appId: number): Promise<void> {
	const response = await postForm('https://store.steampowered.com/app/10', {
		sessionid: sessionId,
		appid_to_clear_from_queue: String(appId),
	});

	if (!response.ok) {
		throw new Error(`Failed to skip app ${appId} (HTTP ${response.status})`);
	}
}

async function getWebApiToken(): Promise<string | null> {
	const response = await fetch('https://store.steampowered.com/', { credentials: 'include' });
	const html = await response.text();
	const doc = new DOMParser().parseFromString(html, 'text/html');
	const config = doc.getElementById('application_config');
	const token = config?.getAttribute('data-loyalty_webapi_token');

	if (!token) {
		return null;
	}

	return JSON.parse(token) as string;
}

export async function canClaimFreeSticker(): Promise<{ canClaim: boolean; nextClaimTime?: number }> {
	const webApiToken = await getWebApiToken();
	if (!webApiToken) {
		return { canClaim: false };
	}

	const canClaimUrl =
		'https://api.steampowered.com/ISaleItemRewardsService/CanClaimItem/v1' +
		`?access_token=${encodeURIComponent(webApiToken)}` +
		'&origin=https%3A%2F%2Fstore.steampowered.com' +
		'&input_protobuf_encoded=CgdlbmdsaXNo';

	const canClaimResponse = await fetch(canClaimUrl, { credentials: 'omit', mode: 'cors' });
	if (!canClaimResponse.ok) {
		return { canClaim: false };
	}

	const decoded = decodeCanClaimItem(await canClaimResponse.arrayBuffer());
	return { canClaim: decoded.canClaim, nextClaimTime: decoded.nextClaimTime };
}

export async function claimFreeSticker(): Promise<{ claimed: boolean; nextClaimTime?: number }> {
	const canClaim = await canClaimFreeSticker();
	if (!canClaim.canClaim) {
		return { claimed: false, nextClaimTime: canClaim.nextClaimTime };
	}

	const webApiToken = await getWebApiToken();
	if (!webApiToken) {
		return { claimed: false };
	}

	const claimUrl = `https://api.steampowered.com/ISaleItemRewardsService/ClaimItem/v1?access_token=${encodeURIComponent(webApiToken)}`;
	const claimResponse = await fetch(claimUrl, {
		method: 'POST',
		credentials: 'omit',
		mode: 'cors',
		headers: {
			'Content-Type': 'multipart/form-data; boundary=----discovery-queue-auto',
		},
		body:
			'------discovery-queue-auto\r\n' +
			'Content-Disposition: form-data; name="input_protobuf_encoded"\r\n\r\n\r\n' +
			'------discovery-queue-auto--\r\n',
	});

	return { claimed: claimResponse.ok };
}

export async function runDiscoveryQueues(config: PluginConfig, onProgress?: (message: string) => void): Promise<RunResult> {
	const sessionId = getSessionId();
	if (!sessionId) {
		return {
			success: false,
			queuesCompleted: 0,
			itemsSkipped: 0,
			stickerClaimed: false,
			message: 'Not logged in to Steam store. Open the store while logged in.',
		};
	}

	let itemsSkipped = 0;
	let queuesCompleted = 0;

	for (let run = 1; run <= config.queueRuns; run++) {
		onProgress?.(`Generating queue ${run}/${config.queueRuns}...`);
		const queue = await generateQueue(sessionId);

		for (let i = 0; i < queue.length; i++) {
			onProgress?.(`Queue ${run}/${config.queueRuns}: skipping item ${i + 1}/${queue.length}...`);
			await skipQueueItem(sessionId, queue[i]);
			itemsSkipped++;
			await sleep(300);
		}

		queuesCompleted++;
		await sleep(500);
	}

	let stickerClaimed = false;
	if (config.claimStickers) {
		onProgress?.('Checking for free stickers...');
		const stickerResult = await claimFreeSticker();
		stickerClaimed = stickerResult.claimed;
	}

	const parts = [`Completed ${queuesCompleted} queue(s), skipped ${itemsSkipped} item(s).`];
	if (config.claimStickers) {
		parts.push(stickerClaimed ? 'Free sticker claimed!' : 'No free sticker available right now.');
	}

	return {
		success: true,
		queuesCompleted,
		itemsSkipped,
		stickerClaimed,
		message: parts.join(' '),
	};
}

export function parseQueueCount(doc: Document): number {
	const subtext = doc.getElementsByClassName('subtext')[0];
	if (!subtext) {
		const queueSubText = doc.getElementsByClassName('queue_sub_text')[0];
		const match = queueSubText?.textContent?.match(/\d+/);
		return match ? Number(match[0]) : 0;
	}

	const queueCountSubtext = subtext.innerHTML;
	let queueCount = parseInt(queueCountSubtext.replace(/[^0-9.]/g, ''), 10);
	if (!Number.isNaN(queueCount)) {
		return queueCount;
	}

	const language = doc.documentElement.getAttribute('lang') ?? 'english';
	const singularPatterns: Record<string, RegExp> = {
		de: / eine /,
		fr: / une /,
		it: / un'altra /,
		pl: / jedną /,
		ru: / одну /,
		uk: / одну /,
		el: / ένα /,
	};

	for (const [lang, pattern] of Object.entries(singularPatterns)) {
		if (language.startsWith(lang) && pattern.test(queueCountSubtext)) {
			return 1;
		}
	}

	return queueCountSubtext.match(/\b(one|1)\b/i) ? 1 : 0;
}

export async function fetchRewardStatus(): Promise<RewardStatus> {
	const sessionId = getSessionId();
	if (!sessionId) {
		return { loggedIn: false, queueCount: 0, canClaimSticker: false };
	}

	let queueCount = 0;
	try {
		const response = await fetch('https://store.steampowered.com/explore/', { credentials: 'include' });
		const html = await response.text();
		queueCount = parseQueueCount(new DOMParser().parseFromString(html, 'text/html'));
	} catch {
		queueCount = 0;
	}

	let canClaimSticker = false;
	try {
		const sticker = await canClaimFreeSticker();
		canClaimSticker = sticker.canClaim;
	} catch {
		canClaimSticker = false;
	}

	return { loggedIn: true, queueCount, canClaimSticker };
}

export function isOnExplorePage(): boolean {
	return /store\.steampowered\.com\/explore/.test(window.location.href);
}

export function isInActiveQueue(): boolean {
	return document.getElementsByClassName('btn_next_in_queue').length > 0;
}

export function handleAgeGate(): boolean {
	const ageYear = document.getElementById('ageYear') as HTMLSelectElement | null;
	if (ageYear) {
		ageYear.value = '1985';
		const doAgeGate = (window as { DoAgeGateSubmit?: () => void; ViewProductPage?: () => void }).DoAgeGateSubmit;
		const viewProduct = (window as { ViewProductPage?: () => void }).ViewProductPage;
		if (typeof doAgeGate === 'function') {
			doAgeGate();
			return true;
		}
		if (typeof viewProduct === 'function') {
			viewProduct();
			return true;
		}
	}

	const appAgeGate = document.getElementById('app_agegate');
	if (appAgeGate) {
		const buttons = appAgeGate.getElementsByClassName('btn_medium');
		for (let i = 0; i < buttons.length; i++) {
			const button = buttons[i] as HTMLElement;
			const onclick = button.getAttribute('onclick');
			if (onclick?.includes('HideAgeGate')) {
				button.click();
				return true;
			}
		}
	}

	return false;
}

export async function autoSkipCurrentQueueItem(): Promise<void> {
	const form = document.getElementById('next_in_queue_form') as HTMLFormElement | null;
	if (!form) {
		return;
	}

	const sessionId = form.querySelector<HTMLInputElement>('input[name="sessionid"]')?.value ?? getSessionId();
	const appId = form.querySelector<HTMLInputElement>('input[name="appid_to_clear_from_queue"]')?.value;
	const snr = form.querySelector<HTMLInputElement>('input[name="snr"]')?.value ?? '1_4_4__125';

	if (!sessionId || !appId) {
		return;
	}

	const response = await postForm(form.getAttribute('action') || 'https://store.steampowered.com/app/10', {
		sessionid: sessionId,
		appid_to_clear_from_queue: appId,
		snr,
	});

	if (!response.ok) {
		throw new Error(`Auto-skip failed (HTTP ${response.status})`);
	}

	const html = await response.text();
	const doc = new DOMParser().parseFromString(html, 'text/html');
	const nextForm = doc.getElementById('next_in_queue_form');

	if (nextForm?.parentElement && form.parentElement) {
		form.parentElement.innerHTML = nextForm.parentElement.innerHTML;
		if (isInActiveQueue()) {
			await sleep(400);
			await autoSkipCurrentQueueItem();
		}
	} else {
		window.location.href = form.getAttribute('action') || window.location.href;
	}
}
