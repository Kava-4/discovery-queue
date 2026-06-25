import {
	DEFAULT_CONFIG,
	type PluginConfig,
	type RunResult,
	autoSkipCurrentQueueItem,
	claimFreeSticker,
	getSessionId,
	handleAgeGate,
	isInActiveQueue,
	isOnExplorePage,
	runDiscoveryQueues,
	fetchRewardStatus,
} from './discoveryQueue';

const STORAGE_KEY = 'discovery_queue_next_sticker_claim';

function readConfig(): PluginConfig {
	const store = (window as { MILLENNIUM_PLUGIN_SETTINGS_STORE?: Record<string, { settingsStore?: Partial<PluginConfig> }> })
		.MILLENNIUM_PLUGIN_SETTINGS_STORE?.discovery_queue?.settingsStore;

	return {
		queueRuns: store?.queueRuns ?? DEFAULT_CONFIG.queueRuns,
		autoRunOnExplore: store?.autoRunOnExplore ?? DEFAULT_CONFIG.autoRunOnExplore,
		claimStickers: store?.claimStickers ?? DEFAULT_CONFIG.claimStickers,
		autoSkipInQueue: store?.autoSkipInQueue ?? DEFAULT_CONFIG.autoSkipInQueue,
		notifyRewards: store?.notifyRewards ?? DEFAULT_CONFIG.notifyRewards,
	};
}

function showStatus(message: string, isError = false): void {
	let banner = document.getElementById('discovery-queue-auto-status');
	if (!banner) {
		banner = document.createElement('div');
		banner.id = 'discovery-queue-auto-status';
		banner.style.cssText =
			'position:fixed;bottom:24px;right:24px;z-index:99999;max-width:360px;padding:12px 16px;border-radius:6px;font:13px "Motiva Sans",Arial,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.35);';
		document.body.appendChild(banner);
	}

	banner.style.background = isError ? '#5c1d1d' : '#1b2838';
	banner.style.color = '#fff';
	banner.style.border = isError ? '1px solid #ff6b6b' : '1px solid #66c0f4';
	banner.textContent = message;
}

function injectExploreButton(onClick: () => void): void {
	if (document.getElementById('discovery-queue-auto-btn')) {
		return;
	}

	const target = document.getElementById('discover_queue') ?? document.querySelector('.discovery_queue_customize');
	if (!target) {
		return;
	}

	const button = document.createElement('button');
	button.id = 'discovery-queue-auto-btn';
	button.type = 'button';
	button.textContent = 'Auto Discover Queue';
	button.className = 'btnv6_blue_hoverfade btn_medium';
	button.style.marginTop = '12px';
	button.addEventListener('click', onClick);

	target.appendChild(button);
}

let running = false;

async function executeRun(config: PluginConfig): Promise<RunResult> {
	if (running) {
		return {
			success: false,
			queuesCompleted: 0,
			itemsSkipped: 0,
			stickerClaimed: false,
			message: 'Already running.',
		};
	}

	running = true;
	try {
		const result = await runDiscoveryQueues(config, showStatus);
		showStatus(result.message, !result.success);
		return result;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		showStatus(message, true);
		return {
			success: false,
			queuesCompleted: 0,
			itemsSkipped: 0,
			stickerClaimed: false,
			message,
		};
	} finally {
		running = false;
	}
}

export async function runAutoDiscover(): Promise<string> {
	const result = await executeRun(readConfig());
	return result.message;
}

export async function checkAvailableRewards(): Promise<string> {
	const status = await fetchRewardStatus();
	return JSON.stringify(status);
}

async function maybeClaimSticker(config: PluginConfig): Promise<void> {
	if (!config.claimStickers || !getSessionId()) {
		return;
	}

	const nextClaim = Number(localStorage.getItem(STORAGE_KEY) || 0);
	if (Date.now() < nextClaim) {
		return;
	}

	try {
		const result = await claimFreeSticker();
		localStorage.setItem(STORAGE_KEY, String(Date.now() + 60 * 60 * 1000));

		if (result.claimed) {
			showStatus('Free sticker claimed!');
		} else if (result.nextClaimTime) {
			localStorage.setItem(STORAGE_KEY, String(result.nextClaimTime * 1000));
		}
	} catch {
		// Non-fatal; queue completion is the main feature.
	}
}

async function bootstrap(): Promise<void> {
	const config = readConfig();

	if (handleAgeGate()) {
		return;
	}

	if (config.autoSkipInQueue && isInActiveQueue()) {
		try {
			await autoSkipCurrentQueueItem();
		} catch (error) {
			console.warn('[Discovery Queue Auto]', error);
		}
		return;
	}

	if (!isOnExplorePage()) {
		await maybeClaimSticker(config);
		return;
	}

	const start = () => {
		void executeRun(config);
	};

	injectExploreButton(start);

	if (config.autoRunOnExplore) {
		start();
		return;
	}

	await maybeClaimSticker(config);
}

export default async function WebkitMain() {
	await bootstrap();
}
