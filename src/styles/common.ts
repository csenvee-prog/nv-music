import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  fullScreen: {
    flex: 1,
    backgroundColor: '#000000',
  },
  playerContainer: {
    paddingBottom: 64, // MiniPlayerHeight
  },
  // Reusable components
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  artworkPlaceholder: {
    backgroundColor: '#282828',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
