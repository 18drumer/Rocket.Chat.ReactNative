import React, { useContext, useLayoutEffect, useRef, useState } from 'react';
import { StyleProp, TextStyle, View } from 'react-native';
import FastImage from 'react-native-fast-image';
import { dequal } from 'dequal';
import { BlurView } from '@react-native-community/blur';

import Touchable from './Touchable';
import Markdown from '../markdown';
import styles from './styles';
import MessageContext from './Context';
import { TGetCustomEmoji } from '../../definitions/IEmoji';
import { IAttachment, IUserMessage } from '../../definitions';
import { useTheme } from '../../theme';
import { formatAttachmentUrl } from '../../lib/methods/helpers/formatAttachmentUrl';
import { cancelDownload, downloadMediaFile, isDownloadActive, searchMediaFileAsync } from '../../lib/methods/handleMediaDownload';
import { fetchAutoDownloadEnabled } from '../../lib/methods/autoDownloadPreference';
import RCActivityIndicator from '../ActivityIndicator';
import { CustomIcon } from '../CustomIcon';

interface IMessageButton {
	children: React.ReactElement;
	disabled?: boolean;
	onPress: () => void;
}

interface IMessageImage {
	file: IAttachment;
	imageUrl?: string;
	showAttachment?: (file: IAttachment) => void;
	style?: StyleProp<TextStyle>[];
	isReply?: boolean;
	getCustomEmoji?: TGetCustomEmoji;
	author?: IUserMessage;
}

const Button = React.memo(({ children, onPress, disabled }: IMessageButton) => {
	const { colors } = useTheme();
	return (
		<Touchable
			disabled={disabled}
			onPress={onPress}
			style={styles.imageContainer}
			background={Touchable.Ripple(colors.bannerBackground)}
		>
			{children}
		</Touchable>
	);
});

const BlurComponent = ({ loading = false }: { loading: boolean }) => {
	const { theme, colors } = useTheme();
	return (
		<>
			<BlurView
				style={[styles.image, styles.imageBlur]}
				blurType={theme === 'light' ? 'light' : 'dark'}
				blurAmount={10}
				reducedTransparencyFallbackColor='white'
			/>
			<View style={[styles.image, styles.imageIndicator]}>
				{loading ? <RCActivityIndicator /> : <CustomIcon color={colors.buttonText} name='arrow-down-circle' size={54} />}
			</View>
		</>
	);
};

export const MessageImage = React.memo(({ imgUri, cached, loading }: { imgUri: string; cached: boolean; loading: boolean }) => {
	const { colors } = useTheme();
	return (
		<>
			<FastImage
				style={[styles.image, { borderColor: colors.borderColor }]}
				source={{ uri: encodeURI(imgUri) }}
				resizeMode={FastImage.resizeMode.cover}
			/>
			{!cached ? <BlurComponent loading={loading} /> : null}
		</>
	);
});

const ImageContainer = React.memo(
	({ file, imageUrl, showAttachment, getCustomEmoji, style, isReply, author }: IMessageImage) => {
		const [imageCached, setImageCached] = useState(file);
		const [cached, setCached] = useState(false);
		const [loading, setLoading] = useState(false);
		const { theme } = useTheme();
		const { baseUrl, user } = useContext(MessageContext);
		const filePath = useRef('');
		const getUrl = (link?: string) => imageUrl || formatAttachmentUrl(link, user.id, user.token, baseUrl);
		const img = getUrl(file.image_url);
		// The param file.title_link is the one that point to image with best quality, however we still need to test the imageUrl
		// And we cannot be certain whether the file.title_link actually exists.
		const imgUrlToCache = getUrl(imageCached.title_link || imageCached.image_url);

		useLayoutEffect(() => {
			const handleImageSearchAndDownload = async () => {
				if (img) {
					const searchImageCached = await searchMediaFileAsync({
						type: 'image',
						mimeType: imageCached.image_type,
						urlToCache: imgUrlToCache
					});
					filePath.current = searchImageCached.filePath;
					if (searchImageCached.file?.exists) {
						setImageCached(prev => ({
							...prev,
							title_link: searchImageCached.file?.uri
						}));
						return setCached(true);
					}
					if (isDownloadActive('image', imgUrlToCache)) {
						return setLoading(true);
					}
					await handleAutoDownload();
				}
			};
			handleImageSearchAndDownload();
		}, []);

		if (!img) {
			return null;
		}

		const handleAutoDownload = async () => {
			const isCurrentUserAuthor = author?._id === user.id;
			const isAutoDownloadEnabled = fetchAutoDownloadEnabled('imagesPreferenceDownload');
			if (isAutoDownloadEnabled || isCurrentUserAuthor) {
				await handleDownload();
			}
		};

		const handleDownload = async () => {
			setLoading(true);
			try {
				const imageUri = await downloadMediaFile({
					downloadUrl: imgUrlToCache,
					mediaType: 'image',
					path: filePath.current
				});
				setImageCached(prev => ({
					...prev,
					title_link: imageUri
				}));
				setCached(true);
				setLoading(false);
			} catch (e) {
				setLoading(false);
				return setCached(false);
			}
		};

		const onPress = () => {
			if (loading && isDownloadActive('image', imgUrlToCache)) {
				cancelDownload('image', imgUrlToCache);
				setLoading(false);
				return setCached(false);
			}
			if (!cached && !loading) {
				return handleDownload();
			}
			if (!showAttachment) {
				return;
			}
			return showAttachment(imageCached);
		};

		if (imageCached.description) {
			return (
				<Button disabled={isReply} onPress={onPress}>
					<View>
						<Markdown
							msg={imageCached.description}
							style={[isReply && style]}
							username={user.username}
							getCustomEmoji={getCustomEmoji}
							theme={theme}
						/>
						<MessageImage imgUri={img} cached={cached} loading={loading} />
					</View>
				</Button>
			);
		}

		return (
			<Button disabled={isReply} onPress={onPress}>
				<MessageImage imgUri={img} cached={cached} loading={loading} />
			</Button>
		);
	},
	(prevProps, nextProps) => dequal(prevProps.file, nextProps.file)
);

ImageContainer.displayName = 'MessageImageContainer';
MessageImage.displayName = 'MessageImage';

export default ImageContainer;
