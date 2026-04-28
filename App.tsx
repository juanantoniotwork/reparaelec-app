import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import LoginScreen from './src/screens/LoginScreen';
import CategorySelectScreen from './src/screens/CategorySelectScreen';
import SubcategorySelectScreen from './src/screens/SubcategorySelectScreen';
import BrandSelectScreen from './src/screens/BrandSelectScreen';
import ChatScreen from './src/screens/ChatScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import SessionDetailScreen from './src/screens/SessionDetailScreen';
import { ThemeProvider } from './src/ThemeContext';

export type RootStackParamList = {
  Login: undefined;
  CategorySelect: undefined;
  SubcategorySelect: {
    categoryId: string | number;
    categoryName: string;
  };
  BrandSelect: {
    categoryId: string | number;
    categoryName: string;
    subcategoryId: string | number;
    subcategoryName: string;
  };
  Chat: {
    sessionId?: number;
    categoryId?: string | number;
    subcategoryId?: string | number;
    brandId?: string | number;
    categoryName?: string;
    subcategoryName?: string;
    brandName?: string;
  } | undefined;
  History: undefined;
  SessionDetail: { sessionId: number };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <ThemeProvider>
      <NavigationContainer>
        <Stack.Navigator initialRouteName="Login" screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen
            name="CategorySelect"
            component={CategorySelectScreen}
            options={{ gestureEnabled: false }}
          />
          <Stack.Screen name="SubcategorySelect" component={SubcategorySelectScreen} />
          <Stack.Screen name="BrandSelect" component={BrandSelectScreen} />
          <Stack.Screen
            name="Chat"
            component={ChatScreen}
            options={{ gestureEnabled: true }}
          />
          <Stack.Screen name="History" component={HistoryScreen} />
          <Stack.Screen name="SessionDetail" component={SessionDetailScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </ThemeProvider>
  );
}
