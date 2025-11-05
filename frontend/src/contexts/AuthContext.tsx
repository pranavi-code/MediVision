import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api, API_URL } from "@/lib/api";

type User = {
	id: string;
	email: string;
	role: "admin" | "doctor" | "lab_tech" | string;
	name?: string;
};

type AuthContextType = {
	user: User | null;
	token: string | null;
	loading: boolean;
	login: (email: string, password: string) => Promise<User>;
	// Generic way to set session from any login flow (e.g., patient login)
	setSession: (user: User, token: string) => void;
	logout: () => void;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
	const [user, setUser] = useState<User | null>(null);
	const [token, setToken] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		const t = localStorage.getItem("auth.token");
		const u = localStorage.getItem("auth.user");
		if (t && u) {
			setToken(t);
			try {
				setUser(JSON.parse(u));
			} catch {
				setUser(null);
			}
		}
		setLoading(false);
	}, []);

	const login = async (email: string, password: string) => {
		const res = await api.post<{ ok: boolean; token: string; user: User }>(
			"/api/auth/login",
			{ email, password }
		);
		// Reuse setSession to keep behavior consistent
		setSession(res.user, res.token);
		return res.user;
	};

	const setSession = (userObj: User, tokenStr: string) => {
		localStorage.setItem("auth.token", tokenStr);
		localStorage.setItem("auth.user", JSON.stringify(userObj));
		setToken(tokenStr);
		setUser(userObj);
	};

	const logout = () => {
		localStorage.removeItem("auth.token");
		localStorage.removeItem("auth.user");
		setToken(null);
		setUser(null);
	};

	const value = useMemo(
		() => ({ user, token, loading, login, setSession, logout }),
		[user, token, loading]
	);

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
	const ctx = useContext(AuthContext);
	if (!ctx) throw new Error("useAuth must be used within AuthProvider");
	return ctx;
}
