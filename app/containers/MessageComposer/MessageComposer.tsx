import React, { useState, ReactElement, useRef, forwardRef, useImperativeHandle, useEffect } from 'react';
import { View, StyleSheet, NativeModules, Keyboard } from 'react-native';
import { KeyboardAccessoryView } from 'react-native-ui-lib/keyboard';
import { useBackHandler } from '@react-native-community/hooks';

import { Autocomplete, Toolbar, EmojiSearchbar, ComposerInput, Left, Right } from './components';
import { MIN_HEIGHT, TIMEOUT_CLOSE_EMOJI_KEYBOARD } from './constants';
import { MessageComposerContext } from './context';
import { useCanUploadFile, useChooseMedia } from './hooks';
import {
	IComposerInput,
	IMessageComposerProps,
	IMessageComposerRef,
	ITrackingView,
	TAutocompleteType,
	TMicOrSend
} from './interfaces';
import { isIOS } from '../../lib/methods/helpers';
import shortnameToUnicode from '../../lib/methods/helpers/shortnameToUnicode';
import { useAppSelector } from '../../lib/hooks';
import { useTheme } from '../../theme';
import { EventTypes } from '../EmojiPicker/interfaces';
import { IEmoji } from '../../definitions';
import getMentionRegexp from '../MessageBox/getMentionRegexp';

const styles = StyleSheet.create({
	container: {
		borderTopWidth: 1,
		paddingHorizontal: 16,
		minHeight: MIN_HEIGHT
	},
	input: {
		flexDirection: 'row'
	}
});

require('../MessageBox/EmojiKeyboard');

export const MessageComposer = forwardRef<IMessageComposerRef, IMessageComposerProps>(
	({ onSendMessage, rid, tmid, sharing = false, editing = false }, ref): ReactElement => {
		// console.count('Message Composer');
		const composerInputRef = useRef(null);
		const composerInputComponentRef = useRef<IComposerInput>({
			sendMessage: () => '',
			getText: () => '',
			getSelection: () => ({ start: 0, end: 0 }),
			setInput: () => {},
			focus: () => {}
		});
		const trackingViewRef = useRef<ITrackingView>({ resetTracking: () => {}, getNativeProps: () => ({ trackingViewHeight: 0 }) });
		const { colors, theme } = useTheme();
		const [micOrSend, setMicOrSend] = useState<TMicOrSend>('mic');
		const [showEmojiKeyboard, setShowEmojiKeyboard] = useState(false);
		const [showEmojiSearchbar, setShowEmojiSearchbar] = useState(false);
		const [focused, setFocused] = useState(false);
		const [trackingViewHeight, setTrackingViewHeight] = useState(0);
		const [keyboardHeight, setKeyboardHeight] = useState(0);
		const [autocompleteType, setAutocompleteType] = useState<TAutocompleteType>(null);
		const [autocompleteText, setAutocompleteText] = useState('');
		const permissionToUpload = useCanUploadFile(rid);
		const { FileUpload_MediaTypeWhiteList, FileUpload_MaxFileSize } = useAppSelector(state => state.settings);
		const { takePhoto, takeVideo, chooseFromLibrary, chooseFile } = useChooseMedia({
			rid,
			tmid,
			allowList: FileUpload_MediaTypeWhiteList as string,
			maxFileSize: FileUpload_MaxFileSize as number,
			permissionToUpload
		});

		useBackHandler(() => {
			if (showEmojiSearchbar) {
				setShowEmojiSearchbar(false);
				return true;
			}
			return false;
		});

		useImperativeHandle(ref, () => ({
			closeEmojiKeyboardAndAction
		}));

		useEffect(() => {
			const showListener = Keyboard.addListener('keyboardWillShow', async () => {
				if (trackingViewRef?.current) {
					const props = await trackingViewRef.current.getNativeProps();
					setKeyboardHeight(props.keyboardHeight);
				}
			});

			const hideListener = Keyboard.addListener('keyboardWillHide', () => {
				setKeyboardHeight(0);
			});

			return () => {
				showListener.remove();
				hideListener.remove();
			};
		}, [trackingViewRef]);

		const sendMessage = () => {
			onSendMessage(composerInputComponentRef.current.sendMessage());
		};

		const onKeyboardResigned = () => {
			if (!showEmojiSearchbar) {
				closeEmojiKeyboard();
			}
		};

		const onKeyboardItemSelected = (_keyboardId: string, params: { eventType: EventTypes; emoji: IEmoji }) => {
			const { eventType, emoji } = params;
			const text = composerInputComponentRef.current.getText();
			let newText = '';
			// if messagebox has an active cursor
			const { start, end } = composerInputComponentRef.current.getSelection();
			const cursor = Math.max(start, end);
			let newCursor;

			switch (eventType) {
				case EventTypes.BACKSPACE_PRESSED:
					// logEvent(events.MB_BACKSPACE);
					const emojiRegex = /\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff]/;
					let charsToRemove = 1;
					const lastEmoji = text.substr(cursor > 0 ? cursor - 2 : text.length - 2, cursor > 0 ? cursor : text.length);
					// Check if last character is an emoji
					if (emojiRegex.test(lastEmoji)) charsToRemove = 2;
					newText =
						text.substr(0, (cursor > 0 ? cursor : text.length) - charsToRemove) + text.substr(cursor > 0 ? cursor : text.length);
					newCursor = cursor - charsToRemove;
					composerInputComponentRef.current.setInput(newText, { start: newCursor, end: newCursor });
					break;
				case EventTypes.EMOJI_PRESSED:
					// logEvent(events.MB_EMOJI_SELECTED);
					let emojiText = '';
					if (typeof emoji === 'string') {
						const shortname = `:${emoji}:`;
						emojiText = shortnameToUnicode(shortname);
					} else {
						emojiText = `:${emoji.name}:`;
					}
					newText = `${text.substr(0, cursor)}${emojiText}${text.substr(cursor)}`;
					newCursor = cursor + emojiText.length;
					composerInputComponentRef.current.setInput(newText, { start: newCursor, end: newCursor });
					break;
				case EventTypes.SEARCH_PRESSED:
					// logEvent(events.MB_EMOJI_SEARCH_PRESSED);
					setShowEmojiKeyboard(false);
					setShowEmojiSearchbar(true);
					break;
				default:
				// Do nothing
			}
		};

		// FIXME: type this
		const onAutocompleteItemSelected = (item: any) => {
			const text = composerInputComponentRef.current.getText();
			const { start, end } = composerInputComponentRef.current.getSelection();
			const cursor = Math.max(start, end);
			const regexp = getMentionRegexp();
			let result = text.substr(0, cursor).replace(regexp, '');
			// Remove the ! after select the canned response
			if (autocompleteType === '!') {
				const lastIndexOfExclamation = text.lastIndexOf('!', cursor);
				result = text.substr(0, lastIndexOfExclamation).replace(regexp, '');
			}
			// const mentionName =
			// 	trackingType === MENTIONS_TRACKING_TYPE_EMOJIS
			// 		? `${item.name || item}:`
			// 		: item.username || item.name || item.command || item.text;
			const mentionName = autocompleteType === '@' ? item.subtitle : item.title;
			const newText = `${result}${mentionName} ${text.slice(cursor)}`;
			// if (trackingType === MENTIONS_TRACKING_TYPE_COMMANDS && item.providesPreview) {
			// 	this.setState({ showCommandPreview: true });
			// }

			const newCursor = cursor + mentionName.length;
			composerInputComponentRef.current.setInput(newText, { start: newCursor, end: newCursor });
			composerInputComponentRef.current.focus();
			requestAnimationFrame(() => {
				setAutocompleteType(null);
				setAutocompleteText('');
			});
		};

		const openEmojiKeyboard = () => {
			// logEvent(events.ROOM_OPEN_EMOJI);
			setShowEmojiKeyboard(true);
			setShowEmojiSearchbar(false);
			// this.stopTrackingMention();
		};

		const closeEmojiKeyboard = () => {
			// TODO: log event
			setShowEmojiKeyboard(false);
			setShowEmojiSearchbar(false);
		};

		const closeEmojiKeyboardAndAction = (action?: Function, params?: any) => {
			closeEmojiKeyboard();
			setTimeout(() => action && action(params), showEmojiKeyboard && isIOS ? TIMEOUT_CLOSE_EMOJI_KEYBOARD : undefined);
		};

		const onEmojiSelected = (emoji: IEmoji) => {
			onKeyboardItemSelected('EmojiKeyboard', { eventType: EventTypes.EMOJI_PRESSED, emoji });
		};

		return (
			<MessageComposerContext.Provider
				value={{
					micOrSend,
					rid,
					tmid,
					editing,
					sharing,
					focused,
					setFocused,
					showEmojiKeyboard,
					showEmojiSearchbar,
					permissionToUpload,
					trackingViewHeight,
					keyboardHeight,
					autocompleteType,
					setAutocompleteType,
					autocompleteText,
					setAutocompleteText,
					setTrackingViewHeight,
					setMicOrSend,
					openEmojiKeyboard,
					closeEmojiKeyboard,
					onEmojiSelected,
					sendMessage,
					takePhoto,
					takeVideo,
					chooseFromLibrary,
					chooseFile,
					closeEmojiKeyboardAndAction
				}}
			>
				<KeyboardAccessoryView
					ref={(ref: ITrackingView) => (trackingViewRef.current = ref)}
					renderContent={() => (
						<>
							<View
								style={[styles.container, { backgroundColor: colors.surfaceLight, borderTopColor: colors.strokeLight }]}
								testID='message-composer'
							>
								<View style={styles.input}>
									<Left />
									<ComposerInput ref={composerInputComponentRef} inputRef={composerInputRef} />
									<Right />
								</View>
								<Toolbar />
								<EmojiSearchbar />
							</View>
						</>
					)}
					kbInputRef={composerInputRef}
					kbComponent={showEmojiKeyboard ? 'EmojiKeyboard' : null}
					kbInitialProps={{ theme }}
					onKeyboardResigned={onKeyboardResigned}
					onItemSelected={onKeyboardItemSelected}
					trackInteractive
					requiresSameParentToManageScrollView
					addBottomView
					bottomViewColor={colors.surfaceLight}
					iOSScrollBehavior={NativeModules.KeyboardTrackingViewTempManager?.KeyboardTrackingScrollBehaviorFixedOffset}
				/>
				<Autocomplete onPress={onAutocompleteItemSelected} />
			</MessageComposerContext.Provider>
		);
	}
);
