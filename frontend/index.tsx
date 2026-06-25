import {
	DialogButton,
	Field,
	IconsModule,
	ToggleField,
	definePlugin,
	callable,
	usePluginConfig,
} from '@steambrew/client';
import { DEFAULT_CONFIG } from '../webkit/discoveryQueue';
import { NotificationWatcher } from './NotificationWatcher';

const runAutoDiscover = callable<[], string>('webkit:runAutoDiscover');

const SettingsContent = () => {
	const [queueRuns, setQueueRuns] = usePluginConfig<number>('queueRuns');
	const [autoRunOnExplore, setAutoRunOnExplore] = usePluginConfig<boolean>('autoRunOnExplore');
	const [claimStickers, setClaimStickers] = usePluginConfig<boolean>('claimStickers');
	const [autoSkipInQueue, setAutoSkipInQueue] = usePluginConfig<boolean>('autoSkipInQueue');
	const [notifyRewards, setNotifyRewards] = usePluginConfig<boolean>('notifyRewards');
	const [lastResult, setLastResult] = usePluginConfig<string>('lastResult');

	const effectiveQueueRuns = queueRuns ?? DEFAULT_CONFIG.queueRuns;
	const effectiveAutoRun = autoRunOnExplore ?? DEFAULT_CONFIG.autoRunOnExplore;
	const effectiveClaimStickers = claimStickers ?? DEFAULT_CONFIG.claimStickers;
	const effectiveAutoSkip = autoSkipInQueue ?? DEFAULT_CONFIG.autoSkipInQueue;
	const effectiveNotify = notifyRewards ?? DEFAULT_CONFIG.notifyRewards;

	const runNow = async () => {
		await setLastResult('Running... open the Steam store if nothing happens.');

		try {
			const results = await runAutoDiscover();
			const message = Array.isArray(results) ? results.find(Boolean) : results;
			await setLastResult(
				typeof message === 'string' && message.length > 0
					? message
					: 'Started. Open Store → Discovery Queue if the store tab is not open.',
			);
		} catch (error) {
			await setLastResult(error instanceof Error ? error.message : String(error));
		}
	};

	return (
		<>
			<Field label="Queue runs per session" description="During sales, 3 runs can earn up to 3 trading cards per day.">
				<input
					type="number"
					min={1}
					max={10}
					value={effectiveQueueRuns}
					onChange={(event) => void setQueueRuns(Number(event.target.value))}
					style={{ width: '72px' }}
				/>
			</Field>

			<ToggleField
				label="Notify when rewards are available"
				description="Steam toast when discovery queue cards or free stickers can be claimed"
				checked={effectiveNotify}
				onChange={(value) => void setNotifyRewards(value)}
			/>

			<ToggleField
				label="Auto-run on Discovery Queue page"
				description="Start automatically when you open store.steampowered.com/explore"
				checked={effectiveAutoRun}
				onChange={(value) => void setAutoRunOnExplore(value)}
			/>

			<ToggleField
				label="Auto-skip while browsing queue"
				description="Automatically advance when you are viewing a queue item page"
				checked={effectiveAutoSkip}
				onChange={(value) => void setAutoSkipInQueue(value)}
			/>

			<ToggleField
				label="Claim free stickers"
				description="Try to claim daily event stickers after completing the queue"
				checked={effectiveClaimStickers}
				onChange={(value) => void setClaimStickers(value)}
			/>

			<Field label="Actions">
				<DialogButton onClick={() => void runNow()}>Run Now</DialogButton>
			</Field>

			{lastResult ? (
				<Field label="Last result" focusable>
					<div>{lastResult}</div>
				</Field>
			) : null}
		</>
	);
};

export default definePlugin(() => ({
	title: 'Discovery Queue Auto',
	icon: <IconsModule.Download />,
	content: (
		<>
			<NotificationWatcher />
			<SettingsContent />
		</>
	),
	alwaysRender: true,
}));
