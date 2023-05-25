import React from 'react';
import { Text, View } from 'react-native';

import { IUser } from '../../definitions';
import I18n from '../../i18n';
import { themes } from '../../lib/constants';
import { useTheme } from '../../theme';
import CustomFields from './CustomFields';
import Timezone from './Timezone';
import styles from './styles';

const Roles = ({ roles }: { roles?: string[] }) => {
	const { theme } = useTheme();

	if (roles && roles.length) {
		<View style={styles.item}>
			<Text style={[styles.itemLabel, { color: themes[theme].titleText }]}>{I18n.t('Roles')}</Text>
			<View style={styles.rolesContainer}>
				{roles.map(role =>
					role ? (
						<View style={[styles.roleBadge, { backgroundColor: themes[theme].chatComponentBackground }]} key={role}>
							<Text style={[styles.role, { color: themes[theme].titleText }]}>{role}</Text>
						</View>
					) : null
				)}
			</View>
		</View>;
	}

	return null;
};

const Direct = ({ roomUser }: { roomUser: IUser & { parsedRoles?: string[] } }): React.ReactElement => (
	<>
		<Roles roles={roomUser.parsedRoles} />
		<Timezone utcOffset={roomUser.utcOffset} />
		<CustomFields customFields={roomUser.customFields} />
	</>
);

export default Direct;
