import { useEffect, useRef, type ReactElement } from 'react';
import { callable, toaster, usePluginConfig } from '@steambrew/client';
import { DEFAULT_CONFIG, type RewardStatus } from '../webkit/discoveryQueue';

const checkAvailableRewards = callable<[], string>('webkit:checkAvailableRewards');
const CHECK_INTERVAL_MS = 60 * 60 * 1000;
const STARTUP_DELAY_MS = 15_000;

function unwrapCallableResult<T>(value: T | T[] | undefined): T | undefined {
	if (Array.isArray(value)) {
		return value.find(Boolean);
	}
	return value;
}

function buildNotificationKey(status: RewardStatus): string {
	return `${status.queueCount}:${status.canClaimSticker ? 1 : 0}`;
}

function buildNotificationBody(status: RewardStatus): string {
	const parts: string[] = [];
	if (status.queueCount > 0) {
		parts.push(
			status.queueCount === 1
				? 'Your discovery queue has 1 item — complete it for a trading card.'
				: `Your discovery queue has ${status.queueCount} items — complete it for trading cards.`,
		);
	}
	if (status.canClaimSticker) {
		parts.push('A free event sticker is available to claim.');
	}
	return parts.join(' ');
}

function parseRewardStatus(raw: string | undefined): RewardStatus | null {
	if (!raw) {
		return null;
	}

	try {
		return JSON.parse(raw) as RewardStatus;
	} catch {
		return null;
	}
}

export function NotificationWatcher(): ReactElement | null {
	const [notifyRewards] = usePluginConfig<boolean>('notifyRewards');
	const [lastNotifiedKey, setLastNotifiedKey] = usePluginConfig<string>('lastNotifiedKey');
	const checkingRef = useRef(false);
	const lastKeyRef = useRef(lastNotifiedKey);
	lastKeyRef.current = lastNotifiedKey;

	useEffect(() => {
		if (notifyRewards === false) {
			return undefined;
		}

		const enabled = notifyRewards ?? DEFAULT_CONFIG.notifyRewards;
		if (!enabled) {
			return undefined;
		}

		const maybeNotify = async () => {
			if (checkingRef.current) {
				return;
			}

			checkingRef.current = true;
			try {
				const raw = unwrapCallableResult(await checkAvailableRewards());
				const status = parseRewardStatus(raw);
				if (!status?.loggedIn) {
					return;
				}

				if (status.queueCount <= 0 && !status.canClaimSticker) {
					if (lastKeyRef.current) {
						await setLastNotifiedKey('');
					}
					return;
				}

				const key = buildNotificationKey(status);
				if (key === lastKeyRef.current) {
					return;
				}

				toaster.toast({
					title: 'Discovery Queue Rewards',
					body: buildNotificationBody(status),
					duration: 10_000,
					showToast: true,
					playSound: true,
				});

				await setLastNotifiedKey(key);
			} catch (error) {
				console.warn('[Discovery Queue Auto] reward check failed', error);
			} finally {
				checkingRef.current = false;
			}
		};

		const startupTimer = window.setTimeout(() => {
			void maybeNotify();
		}, STARTUP_DELAY_MS);

		const intervalId = window.setInterval(() => {
			void maybeNotify();
		}, CHECK_INTERVAL_MS);

		return () => {
			window.clearTimeout(startupTimer);
			window.clearInterval(intervalId);
		};
	}, [notifyRewards, setLastNotifiedKey]);

	return null;
}
