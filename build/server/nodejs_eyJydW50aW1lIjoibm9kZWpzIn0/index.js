import { PassThrough } from "node:stream";
import { createReadableStreamFromReadable } from "@react-router/node";
import { Link, Links, Meta, NavLink, Outlet, Scripts, ScrollRestoration, ServerRouter, UNSAFE_withComponentProps, UNSAFE_withErrorBoundaryProps, data, isRouteErrorResponse, redirect, useLocation, useNavigate } from "react-router";
import { isbot } from "isbot";
import { renderToPipeableStream } from "react-dom/server";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Bell, Check, ChevronRight, ClipboardList, Clock3, CreditCard, FileText, Gift, Home, LayoutGrid, LogOut, Menu, Minus, Plus, ReceiptText, Search, Settings, Settings2, Sparkles, Trash2, UserCircle2, X } from "lucide-react";
import { createServerClient, parseCookieHeader, serializeCookieHeader } from "@supabase/ssr";
//#region \0rolldown/runtime.js
var __defProp = Object.defineProperty;
var __exportAll = (all, no_symbols) => {
	let target = {};
	for (var name in all) __defProp(target, name, {
		get: all[name],
		enumerable: true
	});
	if (!no_symbols) __defProp(target, Symbol.toStringTag, { value: "Module" });
	return target;
};
//#endregion
//#region node_modules/@react-router/dev/dist/config/defaults/entry.server.node.tsx
var entry_server_node_exports = /* @__PURE__ */ __exportAll({
	default: () => handleRequest,
	streamTimeout: () => streamTimeout
});
var streamTimeout = 5e3;
function handleRequest(request, responseStatusCode, responseHeaders, routerContext, loadContext) {
	if (request.method.toUpperCase() === "HEAD") return new Response(null, {
		status: responseStatusCode,
		headers: responseHeaders
	});
	return new Promise((resolve, reject) => {
		let shellRendered = false;
		let userAgent = request.headers.get("user-agent");
		let readyOption = userAgent && isbot(userAgent) || routerContext.isSpaMode ? "onAllReady" : "onShellReady";
		let timeoutId = setTimeout(() => abort(), 6e3);
		const { pipe, abort } = renderToPipeableStream(/* @__PURE__ */ jsx(ServerRouter, {
			context: routerContext,
			url: request.url
		}), {
			[readyOption]() {
				shellRendered = true;
				const body = new PassThrough({ final(callback) {
					clearTimeout(timeoutId);
					timeoutId = void 0;
					callback();
				} });
				const stream = createReadableStreamFromReadable(body);
				responseHeaders.set("Content-Type", "text/html");
				pipe(body);
				resolve(new Response(stream, {
					headers: responseHeaders,
					status: responseStatusCode
				}));
			},
			onShellError(error) {
				reject(error);
			},
			onError(error) {
				responseStatusCode = 500;
				if (shellRendered) console.error(error);
			}
		});
	});
}
//#endregion
//#region src/index.css?url
var src_default = "/assets/index-DHvsE88y.css";
//#endregion
//#region src/root.tsx
var root_exports = /* @__PURE__ */ __exportAll({
	ErrorBoundary: () => ErrorBoundary,
	Layout: () => Layout,
	default: () => root_default,
	links: () => links
});
var links = () => [{
	rel: "stylesheet",
	href: src_default
}];
function Layout({ children }) {
	return /* @__PURE__ */ jsxs("html", {
		lang: "en",
		children: [/* @__PURE__ */ jsxs("head", { children: [
			/* @__PURE__ */ jsx("meta", { charSet: "utf-8" }),
			/* @__PURE__ */ jsx("meta", {
				name: "viewport",
				content: "width=device-width, initial-scale=1"
			}),
			/* @__PURE__ */ jsx(Meta, {}),
			/* @__PURE__ */ jsx(Links, {})
		] }), /* @__PURE__ */ jsxs("body", { children: [
			children,
			/* @__PURE__ */ jsx(ScrollRestoration, {}),
			/* @__PURE__ */ jsx(Scripts, {})
		] })]
	});
}
var root_default = UNSAFE_withComponentProps(function App() {
	return /* @__PURE__ */ jsx(Outlet, {});
});
var ErrorBoundary = UNSAFE_withErrorBoundaryProps(function ErrorBoundary({ error }) {
	const message = isRouteErrorResponse(error) ? `${error.status} ${error.statusText}` : error instanceof Error ? error.message : "Unknown error";
	return /* @__PURE__ */ jsx("main", {
		className: "flex min-h-screen items-center justify-center p-4",
		children: /* @__PURE__ */ jsx("p", {
			className: "text-gray-700",
			children: message
		})
	});
});
//#endregion
//#region src/components/QaffyLogo.tsx
function QaffyLogo({ className = "", light = false }) {
	return /* @__PURE__ */ jsx("div", {
		className,
		"aria-label": "Qaffy logo",
		children: /* @__PURE__ */ jsx("h1", {
			className: `text-4xl leading-[33px] ${light ? "text-white" : "text-[#00b7d4]"}`,
			style: { fontFamily: "Freestyle Script, cursive" },
			children: "Qaffy"
		})
	});
}
//#endregion
//#region src/lib/supabase.server.ts
/**
* Creates a request-scoped Supabase client whose session lives in cookies.
* Call once per loader/action; merge the returned headers into the Response
* so any refreshed session cookies reach the browser.
*/
function getSupabaseServerClient(request) {
	const headers = new Headers();
	const supabaseUrl = process.env.SUPABASE_URL;
	const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
	if (!supabaseUrl || !supabaseAnonKey) throw new Error("Supabase server environment variables are not configured.");
	return {
		supabase: createServerClient(supabaseUrl, supabaseAnonKey, { cookies: {
			getAll() {
				return parseCookieHeader(request.headers.get("Cookie") ?? "");
			},
			setAll(cookiesToSet) {
				for (const { name, value, options } of cookiesToSet) headers.append("Set-Cookie", serializeCookieHeader(name, value, options));
			}
		} }),
		headers
	};
}
var isSupabaseServerConfigured = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);
//#endregion
//#region src/portals/customer/customer-store-context.ts
var CustomerStoreContext = createContext(null);
//#endregion
//#region src/portals/customer/customer-store.tsx
var initialOrders = [
	{
		id: "QF-1042",
		customerId: "ID-1042",
		title: "Wash + Iron",
		status: "Picked up",
		statusTone: "bg-emerald-50 text-emerald-700",
		date: "Today, 09:10 AM",
		pickup: "Pickup scheduled for Fri, 8:00 AM",
		total: 4800,
		items: 6,
		action: "Track order",
		pickupOtp: "QF-2048",
		deliveryOtp: "QF-4187",
		pickedUp: true,
		pickupDate: "Today, 09:10 AM",
		notes: "Separate whites and handle the silk top carefully. Please keep the bag zipped and avoid any fabric softener.",
		service: "Wash + Iron",
		paymentStatus: "Paid",
		pickupLocation: "Lekki Phase 1 pickup point"
	},
	{
		id: "QF-1038",
		customerId: "ID-1038",
		title: "Wash only",
		status: "In progress",
		statusTone: "bg-amber-50 text-amber-700",
		date: "Yesterday, 04:18 PM",
		pickup: "Ready for delivery today",
		total: 7200,
		items: 9,
		action: "View details",
		pickupOtp: "QF-3219",
		pickedUp: false,
		notes: "Please check the denim and towels separately. One pair of white jeans needs extra care.",
		service: "Wash only",
		paymentStatus: "Pending",
		pickupLocation: "Lekki Phase 1 pickup point"
	},
	{
		id: "QF-1027",
		customerId: "ID-1027",
		title: "Wash + Iron",
		status: "Delivered",
		statusTone: "bg-slate-100 text-slate-700",
		date: "Mon, 11:40 AM",
		pickup: "Delivered to your address",
		total: 5500,
		items: 7,
		action: "Reorder",
		pickupOtp: "QF-9081",
		deliveryOtp: "QF-7703",
		pickedUp: true,
		pickupDate: "Mon, 11:40 AM",
		notes: "Customer collected the order successfully and the delivery OTP was verified on arrival.",
		service: "Wash + Iron",
		paymentStatus: "Paid",
		pickupLocation: "Lekki Phase 1 pickup point"
	}
];
function createOtp(prefix, number) {
	return `${prefix}-${String(number).padStart(4, "0")}`;
}
function CustomerStoreProvider({ children }) {
	const [orders, setOrders] = useState(initialOrders);
	const [balance, setBalance] = useState(18750);
	const store = useMemo(() => ({
		customerId: "ID-1042",
		customerName: "Aisha",
		balance,
		debt: Math.max(0, -balance),
		subscription: {
			name: "Silver",
			billingPeriod: "semester"
		},
		pickupLocations: [
			"Lekki Phase 1 pickup point",
			"Ikoyi collection desk",
			"Victoria Island hub"
		],
		orders,
		addOrder: ({ items, notes, pickupLocation }) => {
			const idNumber = 1042 + orders.length + 1;
			const total = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
			const clothes = items.reduce((sum, item) => sum + item.quantity, 0);
			const service = [...new Set(items.map((item) => item.service))].join(" + ");
			const order = {
				id: `QF-${idNumber}`,
				customerId: "ID-1042",
				title: service,
				status: "Awaiting pickup",
				statusTone: "bg-sky-50 text-sky-700",
				date: "Just now",
				pickup: "Pickup will be confirmed after OTP verification",
				total,
				items: clothes,
				action: "View details",
				pickupOtp: createOtp("QF", 2e3 + idNumber),
				pickedUp: false,
				notes: notes || "No special instructions added.",
				service,
				paymentStatus: "Pending",
				pickupLocation,
				lines: items
			};
			setOrders((currentOrders) => [order, ...currentOrders]);
			setBalance((currentBalance) => currentBalance - total);
			return order;
		}
	}), [balance, orders]);
	return /* @__PURE__ */ jsx(CustomerStoreContext.Provider, {
		value: store,
		children
	});
}
//#endregion
//#region src/portals/customer/customer-store-hook.ts
function useCustomerStore() {
	const store = useContext(CustomerStoreContext);
	if (!store) throw new Error("useCustomerStore must be used inside CustomerStoreProvider");
	return store;
}
//#endregion
//#region src/portals/customer/CustomerLayout.tsx
var CustomerLayout_exports = /* @__PURE__ */ __exportAll({
	default: () => CustomerLayout_default,
	loader: () => loader
});
var navItems$1 = [
	{
		to: "/",
		label: "Overview",
		icon: Home,
		end: true
	},
	{
		to: "/transactions",
		label: "Transactions",
		icon: ReceiptText
	},
	{
		to: "/orders",
		label: "Orders",
		icon: LayoutGrid
	},
	{
		to: "/plans",
		label: "Plans",
		icon: Sparkles
	},
	{
		to: "/settings",
		label: "Settings",
		icon: Settings
	}
];
async function loader({ request }) {
	if (!isSupabaseServerConfigured) return null;
	const { supabase: serverSupabase, headers } = getSupabaseServerClient(request);
	const { data: userData } = await serverSupabase.auth.getUser();
	if (!userData.user) throw redirect("/login", { headers });
	return data({ user: userData.user }, { headers });
}
function PlanSummary() {
	const { balance } = useCustomerStore();
	return /* @__PURE__ */ jsxs("div", {
		className: "mt-auto rounded-2xl border border-[#a7d7d2] bg-[#eef9f7] p-3.5",
		children: [
			/* @__PURE__ */ jsx("p", {
				className: "text-[10px] font-semibold uppercase tracking-[0.16em] text-[#418d87]",
				children: "Current plan"
			}),
			/* @__PURE__ */ jsx("p", {
				className: "mt-2 text-sm font-semibold text-slate-800",
				children: "Weekly Plus"
			}),
			balance < 0 && /* @__PURE__ */ jsxs("p", {
				className: "mt-1 text-xs text-[#d9364e]",
				children: ["Balance due: ₦", Math.abs(balance).toLocaleString()]
			}),
			/* @__PURE__ */ jsx("div", {
				className: "mt-3 h-1.5 overflow-hidden bg-[#d3ebe8]",
				children: /* @__PURE__ */ jsx("div", { className: "h-full w-3/4 bg-[#55aaa3]" })
			})
		]
	});
}
var CustomerLayout_default = UNSAFE_withComponentProps(function CustomerLayout() {
	const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
	const location = useLocation();
	const navigate = useNavigate();
	const pageTitle = location.pathname === "/" ? "Overview" : location.pathname.startsWith("/invoice") ? "Invoice" : location.pathname.startsWith("/otp") ? "OTP" : navItems$1.find((item) => item.to !== "/" && location.pathname.startsWith(item.to))?.label ?? "Overview";
	const closeMobileMenu = () => setMobileMenuOpen(false);
	const handleLogout = async () => {
		navigate("/login");
	};
	return /* @__PURE__ */ jsx(CustomerStoreProvider, { children: /* @__PURE__ */ jsx("div", {
		className: "relative min-h-screen bg-[#fafafa] text-[#121212]",
		children: /* @__PURE__ */ jsxs("div", {
			className: "relative z-10 min-h-screen lg:flex",
			children: [/* @__PURE__ */ jsxs("aside", {
				className: "sticky top-0 hidden h-screen max-h-screen w-[221px] shrink-0 overflow-y-auto border-r border-[#f2f3f3] bg-white px-[13px] py-8 shadow-[1px_0_8px_rgba(18,18,18,0.04)] lg:flex lg:flex-col",
				children: [
					/* @__PURE__ */ jsx("div", {
						className: "px-3",
						children: /* @__PURE__ */ jsx(QaffyLogo, {})
					}),
					/* @__PURE__ */ jsx("nav", {
						className: "mx-auto mt-12 w-[194px] space-y-[3px]",
						children: navItems$1.map((item) => {
							const Icon = item.icon;
							return /* @__PURE__ */ jsxs(NavLink, {
								to: item.to,
								end: item.end,
								className: ({ isActive }) => `flex h-10 items-center gap-3 rounded-[10px] px-4 text-sm font-medium transition ${isActive ? "bg-[#e8fbfd] text-[#00b7d4]" : "text-[#121212] hover:bg-[#fafafa]"}`,
								children: [/* @__PURE__ */ jsx("span", {
									className: "flex h-5 w-5 items-center justify-center rounded-[5px] text-[#121212]",
									children: /* @__PURE__ */ jsx(Icon, { className: "h-4 w-4" })
								}), /* @__PURE__ */ jsx("span", { children: item.label })]
							}, item.to);
						})
					}),
					/* @__PURE__ */ jsxs("div", {
						className: "mt-auto space-y-1",
						children: [/* @__PURE__ */ jsxs("button", {
							type: "button",
							onClick: handleLogout,
							className: "flex h-10 w-full items-center gap-3 rounded-[10px] px-4 text-sm font-medium text-[#121212] hover:bg-[#fafafa]",
							children: [/* @__PURE__ */ jsx(ClipboardList, { className: "h-4 w-4" }), /* @__PURE__ */ jsx("span", { children: "Activity log" })]
						}), /* @__PURE__ */ jsxs("button", {
							type: "button",
							className: "flex h-10 w-full items-center gap-3 rounded-[10px] px-4 text-sm font-medium text-[#121212] hover:bg-[#fafafa]",
							children: [/* @__PURE__ */ jsx(LogOut, { className: "h-4 w-4" }), /* @__PURE__ */ jsx("span", { children: "Log out" })]
						})]
					})
				]
			}), /* @__PURE__ */ jsxs("div", {
				className: "min-w-0 flex-1",
				children: [
					/* @__PURE__ */ jsx("header", {
						className: "sticky top-0 z-20 border-b border-[#f2f3f3] bg-white lg:hidden",
						children: /* @__PURE__ */ jsxs("div", {
							className: "mx-auto flex max-w-3xl items-center justify-between px-4 py-3.5 sm:px-6",
							children: [
								/* @__PURE__ */ jsx("button", {
									type: "button",
									"aria-label": "Open navigation menu",
									"aria-expanded": mobileMenuOpen,
									onClick: () => setMobileMenuOpen((open) => !open),
									className: "flex h-9 w-9 items-center justify-center rounded-lg border border-[#e7e7e7] bg-white text-slate-600",
									children: mobileMenuOpen ? /* @__PURE__ */ jsx(X, { className: "h-5 w-5" }) : /* @__PURE__ */ jsx(Menu, { className: "h-5 w-5" })
								}),
								/* @__PURE__ */ jsx(QaffyLogo, { className: "scale-[0.82]" }),
								/* @__PURE__ */ jsx("button", {
									type: "button",
									"aria-label": "Open profile",
									className: "flex h-9 w-9 items-center justify-center rounded-lg border border-[#e7e7e7] bg-white text-slate-600",
									children: /* @__PURE__ */ jsx(UserCircle2, { className: "h-5 w-5" })
								})
							]
						})
					}),
					mobileMenuOpen && /* @__PURE__ */ jsxs("div", {
						className: "fixed inset-0 z-40 lg:hidden",
						children: [/* @__PURE__ */ jsx("button", {
							type: "button",
							"aria-label": "Close navigation menu",
							className: "absolute inset-0 bg-slate-950/35",
							onClick: closeMobileMenu
						}), /* @__PURE__ */ jsxs("aside", {
							className: "relative z-10 flex h-full w-[82%] max-w-sm flex-col border-r border-[#e7e7e7] bg-white px-4 py-5 shadow-xl",
							children: [
								/* @__PURE__ */ jsxs("div", {
									className: "mb-6 flex items-center justify-between",
									children: [/* @__PURE__ */ jsx(QaffyLogo, { className: "scale-[0.82]" }), /* @__PURE__ */ jsx("button", {
										type: "button",
										"aria-label": "Close navigation menu",
										onClick: closeMobileMenu,
										className: "flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600",
										children: /* @__PURE__ */ jsx(X, { className: "h-4 w-4" })
									})]
								}),
								/* @__PURE__ */ jsx("nav", {
									className: "space-y-1",
									children: navItems$1.map((item) => {
										const Icon = item.icon;
										return /* @__PURE__ */ jsx(NavLink, {
											to: item.to,
											end: item.end,
											onClick: closeMobileMenu,
											className: ({ isActive }) => `flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm font-medium transition ${isActive ? "bg-[#e8fbfd] text-[#00b7d4]" : "text-[#121212] hover:bg-[#fafafa]"}`,
											children: ({ isActive }) => /* @__PURE__ */ jsxs(Fragment, { children: [/* @__PURE__ */ jsx("span", {
												className: `flex h-8 w-8 items-center justify-center rounded-md ${isActive ? "text-[#00b7d4]" : "text-[#121212]"}`,
												children: /* @__PURE__ */ jsx(Icon, { className: "h-4 w-4" })
											}), /* @__PURE__ */ jsx("span", { children: item.label })] })
										}, item.to);
									})
								}),
								/* @__PURE__ */ jsx(PlanSummary, {})
							]
						})]
					}),
					/* @__PURE__ */ jsxs("div", {
						className: "hidden h-[70px] items-center justify-between gap-4 px-7 pt-[22px] lg:flex",
						children: [/* @__PURE__ */ jsx("h2", {
							className: "text-2xl font-bold tracking-tight text-[#121212]",
							children: pageTitle
						}), /* @__PURE__ */ jsxs("div", {
							className: "flex items-center gap-4",
							children: [/* @__PURE__ */ jsxs("div", {
								className: "flex h-12 w-[288px] items-center gap-2 rounded-full border border-[#f2f3f3] bg-white px-4 text-sm text-[#505959]",
								children: [/* @__PURE__ */ jsx(Search, { className: "h-3.5 w-3.5 text-[#8e9a9a]" }), /* @__PURE__ */ jsx("span", { children: "Search" })]
							}), /* @__PURE__ */ jsxs("button", {
								type: "button",
								"aria-label": "Notifications",
								className: "relative flex h-10 w-10 items-center justify-center rounded-full border border-[#f2f3f3] bg-white text-[#121212]",
								children: [/* @__PURE__ */ jsx(Bell, { className: "h-4 w-4" }), /* @__PURE__ */ jsx("span", { className: "absolute right-2 top-1 h-2 w-2 rounded-full border-2 border-white bg-[#f59e0b]" })]
							})]
						})]
					}),
					/* @__PURE__ */ jsx("main", {
						className: "mx-auto w-full max-w-300 px-4 pb-8 pt-5 sm:px-6 sm:pt-6 lg:pb-10 lg:pt-5",
						children: /* @__PURE__ */ jsx(Outlet, {})
					})
				]
			})]
		})
	}) });
});
//#endregion
//#region src/components/BubblyBackground.tsx
var bubbles = [
	{
		size: 10,
		left: 7,
		bottom: 2,
		duration: 18,
		delay: -4
	},
	{
		size: 20,
		left: 16,
		bottom: 11,
		duration: 23,
		delay: -14
	},
	{
		size: 14,
		left: 27,
		bottom: 5,
		duration: 20,
		delay: -8
	},
	{
		size: 34,
		left: 38,
		bottom: -4,
		duration: 27,
		delay: -20
	},
	{
		size: 12,
		left: 49,
		bottom: 8,
		duration: 19,
		delay: -2
	},
	{
		size: 26,
		left: 59,
		bottom: 3,
		duration: 24,
		delay: -12
	},
	{
		size: 16,
		left: 70,
		bottom: 13,
		duration: 21,
		delay: -17
	},
	{
		size: 42,
		left: 82,
		bottom: -7,
		duration: 30,
		delay: -24
	},
	{
		size: 11,
		left: 92,
		bottom: 7,
		duration: 17,
		delay: -7
	}
];
var centeredPositions = [
	32,
	44,
	56,
	68
];
function BubblyBackground({ count = bubbles.length, color = "#00b7d4", opacity = .12, scale = 1, className = "", contained = false, centered = false }) {
	return /* @__PURE__ */ jsx("div", {
		className: `qaffy-bubbles ${contained ? "qaffy-bubbles--contained" : ""} ${centered ? "qaffy-bubbles--centered" : ""} ${className}`,
		"aria-hidden": "true",
		children: bubbles.slice(0, count).map((bubble, index) => /* @__PURE__ */ jsx("span", {
			className: "qaffy-bubble",
			style: {
				"--bubble-color": color,
				"--bubble-opacity": opacity,
				"--bubble-size": `${bubble.size}px`,
				"--bubble-scale": scale,
				"--bubble-left": centered ? `${centeredPositions[index % centeredPositions.length]}%` : `${bubble.left}%`,
				"--bubble-bottom": `${bubble.bottom}%`,
				"--bubble-duration": `${bubble.duration}s`,
				"--bubble-delay": `${bubble.delay}s`
			}
		}, `${bubble.left}-${index}`))
	});
}
//#endregion
//#region src/portals/customer/pages/NewOrder.tsx
var categories = [
	{
		name: "General clothing",
		price: 350,
		description: "Shirts, trousers, blouses, skirts and native wear"
	},
	{
		name: "Bedsheet",
		price: 700,
		description: "Bedsheets and duvet covers"
	},
	{
		name: "Towel",
		price: 700,
		description: "Bath and hand towels"
	},
	{
		name: "Suit",
		price: 3e3,
		description: "Two-piece and three-piece suits"
	},
	{
		name: "Hoodie",
		price: 500,
		description: "Hoodies and heavy tops"
	},
	{
		name: "Duvet",
		price: 2500,
		description: "Duvets and large bedding"
	},
	{
		name: "Pair of shoes",
		price: 1200,
		description: "One pair of shoes or one bag"
	}
];
var services = [
	{
		name: "Wash",
		description: "Clean and fold"
	},
	{
		name: "Iron",
		description: "Pressed and ready"
	},
	{
		name: "Wash + Iron",
		description: "Clean, pressed and folded"
	}
];
function NewOrder({ onClose }) {
	const { addOrder, pickupLocations } = useCustomerStore();
	const [category, setCategory] = useState(categories[0]);
	const [service, setService] = useState(services[2]);
	const [quantity, setQuantity] = useState(1);
	const [items, setItems] = useState([]);
	const [pickupLocation, setPickupLocation] = useState(pickupLocations[0]);
	const [notes, setNotes] = useState("");
	const draftLine = {
		category: category.name,
		service: service.name,
		quantity,
		unitPrice: category.price
	};
	const total = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
	const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
	const addItem = () => {
		setItems((currentItems) => [...currentItems, draftLine]);
		setQuantity(1);
	};
	return /* @__PURE__ */ jsx("div", {
		className: "fixed inset-0 z-50 flex items-end justify-center bg-slate-950/35 p-0 sm:items-center sm:p-4",
		role: "presentation",
		onMouseDown: onClose,
		children: /* @__PURE__ */ jsxs("section", {
			role: "dialog",
			"aria-modal": "true",
			"aria-labelledby": "new-order-title",
			onMouseDown: (event) => event.stopPropagation(),
			className: "relative max-h-[94vh] w-full overflow-y-auto rounded-2xl border border-[#e7e7e7] bg-white p-4 shadow-xl sm:max-w-3xl sm:p-6",
			children: [
				/* @__PURE__ */ jsx(BubblyBackground, {
					contained: true,
					centered: true,
					count: 4,
					scale: 7,
					opacity: .38,
					color: "#00b7d4"
				}),
				/* @__PURE__ */ jsxs("header", {
					className: "flex items-start justify-between gap-3",
					children: [/* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("h2", {
						id: "new-order-title",
						className: "text-2xl font-bold tracking-tight text-[#121212]",
						children: "Create an order"
					}), /* @__PURE__ */ jsx("p", {
						className: "mt-1 text-sm text-slate-500",
						children: "Add each type of item and choose how you want it cared for."
					})] }), /* @__PURE__ */ jsx("button", {
						type: "button",
						onClick: onClose,
						"aria-label": "Close new order",
						className: "flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-xl text-slate-500 transition hover:border-[#a8eaf0] hover:text-[#00b7d4]",
						children: "×"
					})]
				}),
				/* @__PURE__ */ jsxs("section", {
					className: "mt-5 rounded-2xl border border-[#e7e7e7] p-4 sm:p-5",
					children: [
						/* @__PURE__ */ jsxs("div", {
							className: "flex items-center justify-between gap-3",
							children: [/* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("h3", {
								className: "text-lg font-bold text-slate-900",
								children: "Add laundry items"
							}), /* @__PURE__ */ jsx("p", {
								className: "mt-1 text-sm text-slate-500",
								children: "Choose a category, service and quantity. Add another row for more items."
							})] }), /* @__PURE__ */ jsxs("span", {
								className: "rounded-full bg-[#e8fbfd] px-2.5 py-1 text-xs font-medium text-[#00b7d4]",
								children: [
									items.length,
									" item type",
									items.length === 1 ? "" : "s"
								]
							})]
						}),
						/* @__PURE__ */ jsxs("div", {
							className: "mt-4 grid gap-3 sm:grid-cols-[1.2fr_1fr_120px]",
							children: [
								/* @__PURE__ */ jsxs("label", { children: [/* @__PURE__ */ jsx("span", {
									className: "mb-1.5 block text-sm font-medium text-slate-600",
									children: "Category"
								}), /* @__PURE__ */ jsx("select", {
									value: category.name,
									onChange: (event) => setCategory(categories.find((item) => item.name === event.target.value) ?? categories[0]),
									className: "w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 focus:border-[#00b7d4] focus:ring-2 focus:ring-[#d1f5f8]",
									children: categories.map((item) => /* @__PURE__ */ jsxs("option", {
										value: item.name,
										children: [
											item.name,
											" · ₦",
											item.price.toLocaleString()
										]
									}, item.name))
								})] }),
								/* @__PURE__ */ jsxs("label", { children: [/* @__PURE__ */ jsx("span", {
									className: "mb-1.5 block text-sm font-medium text-slate-600",
									children: "Service"
								}), /* @__PURE__ */ jsx("select", {
									value: service.name,
									onChange: (event) => setService(services.find((item) => item.name === event.target.value) ?? services[0]),
									className: "w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 focus:border-[#00b7d4] focus:ring-2 focus:ring-[#d1f5f8]",
									children: services.map((item) => /* @__PURE__ */ jsx("option", {
										value: item.name,
										children: item.name
									}, item.name))
								})] }),
								/* @__PURE__ */ jsxs("label", { children: [/* @__PURE__ */ jsx("span", {
									className: "mb-1.5 block text-sm font-medium text-slate-600",
									children: "Quantity"
								}), /* @__PURE__ */ jsxs("div", {
									className: "flex h-[46px] items-center justify-between rounded-2xl border border-slate-200 px-2",
									children: [
										/* @__PURE__ */ jsx("button", {
											type: "button",
											"aria-label": "Decrease quantity",
											onClick: () => setQuantity((value) => Math.max(1, value - 1)),
											className: "flex h-8 w-8 items-center justify-center rounded-2xl text-slate-500 hover:bg-slate-50",
											children: /* @__PURE__ */ jsx(Minus, { className: "h-4 w-4" })
										}),
										/* @__PURE__ */ jsx("span", {
											className: "font-semibold text-slate-900",
											children: quantity
										}),
										/* @__PURE__ */ jsx("button", {
											type: "button",
											"aria-label": "Increase quantity",
											onClick: () => setQuantity((value) => value + 1),
											className: "flex h-8 w-8 items-center justify-center rounded-2xl text-slate-500 hover:bg-slate-50",
											children: /* @__PURE__ */ jsx(Plus, { className: "h-4 w-4" })
										})
									]
								})] })
							]
						}),
						/* @__PURE__ */ jsxs("p", {
							className: "mt-2 text-xs text-slate-500",
							children: [
								category.description,
								" · ",
								service.description
							]
						}),
						/* @__PURE__ */ jsxs("button", {
							type: "button",
							onClick: addItem,
							className: "mt-4 inline-flex items-center gap-2 rounded-2xl border border-[#a8eaf0] bg-[#f0fcfd] px-3.5 py-2.5 text-sm font-semibold text-[#00b7d4] hover:bg-[#e8fbfd]",
							children: [/* @__PURE__ */ jsx(Plus, { className: "h-4 w-4" }), " Add item"]
						}),
						items.length > 0 && /* @__PURE__ */ jsx("div", {
							className: "mt-5 divide-y divide-slate-100 rounded-2xl border border-slate-200",
							children: items.map((item, index) => /* @__PURE__ */ jsxs("div", {
								className: "flex items-center gap-3 p-3 text-sm",
								children: [
									/* @__PURE__ */ jsxs("div", {
										className: "min-w-0 flex-1",
										children: [/* @__PURE__ */ jsx("p", {
											className: "font-semibold text-slate-900",
											children: item.category
										}), /* @__PURE__ */ jsxs("p", {
											className: "text-xs text-slate-500",
											children: [
												item.service,
												" · ",
												item.quantity,
												" item",
												item.quantity === 1 ? "" : "s"
											]
										})]
									}),
									/* @__PURE__ */ jsxs("span", {
										className: "font-semibold text-slate-900",
										children: ["₦", (item.quantity * item.unitPrice).toLocaleString()]
									}),
									/* @__PURE__ */ jsx("button", {
										type: "button",
										"aria-label": `Remove ${item.category}`,
										onClick: () => setItems((currentItems) => currentItems.filter((_, itemIndex) => itemIndex !== index)),
										className: "flex h-8 w-8 items-center justify-center rounded-2xl text-slate-400 hover:bg-[#e8fbfd] hover:text-[#00b7d4]",
										children: /* @__PURE__ */ jsx(Trash2, { className: "h-4 w-4" })
									})
								]
							}, `${item.category}-${item.service}-${index}`))
						})
					]
				}),
				/* @__PURE__ */ jsxs("section", {
					className: "mt-4 rounded-2xl border border-[#e7e7e7] p-4 sm:p-5",
					children: [/* @__PURE__ */ jsxs("label", { children: [/* @__PURE__ */ jsxs("span", {
						className: "mb-1.5 block text-sm font-medium text-slate-600",
						children: ["Pickup instructions ", /* @__PURE__ */ jsx("span", {
							className: "font-normal text-slate-400",
							children: "(optional)"
						})]
					}), /* @__PURE__ */ jsx("textarea", {
						rows: 3,
						placeholder: "Separate whites, handle silk carefully...",
						value: notes,
						onChange: (event) => setNotes(event.target.value),
						className: "w-full resize-none rounded-2xl border border-slate-200 bg-white px-3 py-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-[#00b7d4] focus:ring-2 focus:ring-[#d1f5f8]"
					})] }), /* @__PURE__ */ jsxs("label", {
						className: "mt-4 block",
						children: [/* @__PURE__ */ jsx("span", {
							className: "mb-1.5 block text-sm font-medium text-slate-600",
							children: "Pickup location"
						}), /* @__PURE__ */ jsx("select", {
							value: pickupLocation,
							onChange: (event) => setPickupLocation(event.target.value),
							className: "w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-base text-slate-900 focus:border-[#00b7d4] focus:ring-2 focus:ring-[#d1f5f8]",
							children: pickupLocations.map((location) => /* @__PURE__ */ jsx("option", { children: location }, location))
						})]
					})]
				}),
				/* @__PURE__ */ jsxs("section", {
					className: "mt-4 rounded-2xl border border-[#a7d7d2] bg-[#eef9f7] p-5 text-slate-900 sm:p-6",
					children: [/* @__PURE__ */ jsxs("div", {
						className: "flex items-start justify-between gap-4",
						children: [/* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("p", {
							className: "text-xs font-semibold uppercase tracking-[0.16em] text-[#418d87]",
							children: "Order estimate"
						}), /* @__PURE__ */ jsxs("p", {
							className: "mt-2 text-sm text-slate-600",
							children: [
								itemCount,
								" item",
								itemCount === 1 ? "" : "s",
								" across ",
								items.length,
								" item type",
								items.length === 1 ? "" : "s"
							]
						})] }), /* @__PURE__ */ jsxs("p", {
							className: "text-2xl font-bold",
							children: ["₦", total.toLocaleString()]
						})]
					}), /* @__PURE__ */ jsx("button", {
						type: "button",
						disabled: items.length === 0,
						onClick: () => {
							addOrder({
								items,
								notes,
								pickupLocation
							});
							onClose();
						},
						className: "mt-5 w-full rounded-2xl bg-[#00b7d4] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#007f99] disabled:cursor-not-allowed disabled:opacity-50",
						children: "Continue to pickup details"
					})]
				})
			]
		})
	});
}
//#endregion
//#region src/portals/customer/pages/TopUpModal.tsx
var pendingOrders = [{
	id: "QF-1038",
	amount: 7200
}, {
	id: "QF-1042",
	amount: 4800
}];
function TopUpModal({ currentBalance, onClose }) {
	const debt = useMemo(() => {
		const pendingTotal = pendingOrders.reduce((sum, order) => sum + order.amount, 0);
		return Math.max(pendingTotal - currentBalance, 0);
	}, [currentBalance]);
	const suggestedAmount = useMemo(() => {
		const minimum = 1e3;
		return Math.max(debt > 0 ? debt : minimum, minimum);
	}, [debt]);
	const [amount, setAmount] = useState(suggestedAmount);
	return /* @__PURE__ */ jsx("div", {
		className: "fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-sm sm:items-center sm:p-4",
		role: "presentation",
		onMouseDown: onClose,
		children: /* @__PURE__ */ jsxs("section", {
			role: "dialog",
			"aria-modal": "true",
			"aria-labelledby": "top-up-title",
			onMouseDown: (event) => event.stopPropagation(),
			className: "max-h-[94vh] w-full overflow-y-auto rounded-t-[30px] bg-slate-50 p-4 shadow-2xl shadow-slate-950/20 sm:max-w-xl sm:rounded-[30px] sm:p-6",
			children: [
				/* @__PURE__ */ jsxs("header", {
					className: "flex items-start justify-between gap-3",
					children: [/* @__PURE__ */ jsx("div", { children: /* @__PURE__ */ jsx("h2", {
						id: "top-up-title",
						className: "mt-1 text-2xl font-bold tracking-tight text-[#121212]",
						children: "Add funds"
					}) }), /* @__PURE__ */ jsx("button", {
						type: "button",
						onClick: onClose,
						"aria-label": "Close top-up modal",
						className: "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-xl text-slate-500 shadow-sm transition hover:border-violet-200 hover:text-violet-700",
						children: "×"
					})]
				}),
				/* @__PURE__ */ jsx("div", {
					className: "mt-5 rounded-[26px] bg-slate-900 p-5 text-white shadow-lg shadow-slate-200",
					children: /* @__PURE__ */ jsxs("div", {
						className: "flex items-center justify-between gap-3",
						children: [/* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("p", {
							className: "text-xs font-medium uppercase tracking-[0.18em] text-sky-200",
							children: "Current balance"
						}), /* @__PURE__ */ jsxs("p", {
							className: "mt-2 text-3xl font-bold",
							children: ["₦", currentBalance.toLocaleString()]
						})] }), /* @__PURE__ */ jsx("span", {
							className: "rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-sky-50",
							children: "Wallet"
						})]
					})
				}),
				/* @__PURE__ */ jsxs("div", {
					className: "mt-5 rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm shadow-slate-100 sm:p-5",
					children: [
						/* @__PURE__ */ jsxs("label", {
							className: "block",
							children: [/* @__PURE__ */ jsx("span", {
								className: "mb-1.5 block text-sm font-medium text-slate-600",
								children: "Top-up amount"
							}), /* @__PURE__ */ jsx("input", {
								type: "number",
								min: 1e3,
								value: amount,
								onChange: (event) => setAmount(Number(event.target.value) || 0),
								className: "w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-base text-slate-900 focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
							})]
						}),
						/* @__PURE__ */ jsx("div", {
							className: "mt-4 rounded-2xl bg-sky-50 p-3 text-sm text-slate-700",
							children: debt > 0 ? /* @__PURE__ */ jsxs("p", { children: [
								"Your recent unpaid orders total ",
								/* @__PURE__ */ jsxs("span", {
									className: "font-semibold text-sky-700",
									children: ["₦", debt.toLocaleString()]
								}),
								". This amount is prefilled so the most recent debt is settled first."
							] }) : /* @__PURE__ */ jsxs("p", { children: [
								"Minimum top-up is ",
								/* @__PURE__ */ jsx("span", {
									className: "font-semibold text-sky-700",
									children: "₦1,000"
								}),
								". You can add more if you want a larger balance."
							] })
						}),
						/* @__PURE__ */ jsxs("div", {
							className: "mt-4 rounded-2xl bg-slate-50 p-3",
							children: [/* @__PURE__ */ jsx("p", {
								className: "text-[10px] uppercase tracking-[0.22em] text-slate-400",
								children: "Pending orders"
							}), /* @__PURE__ */ jsx("div", {
								className: "mt-3 space-y-2",
								children: pendingOrders.map((order) => /* @__PURE__ */ jsxs("div", {
									className: "flex items-center justify-between text-sm text-slate-600",
									children: [/* @__PURE__ */ jsx("span", { children: order.id }), /* @__PURE__ */ jsxs("span", {
										className: "font-semibold text-slate-900",
										children: ["₦", order.amount.toLocaleString()]
									})]
								}, order.id))
							})]
						}),
						/* @__PURE__ */ jsx("button", {
							type: "button",
							className: "mt-5 w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-slate-200 transition hover:bg-slate-800",
							children: "Continue to Paystack"
						})
					]
				})
			]
		})
	});
}
//#endregion
//#region src/portals/customer/pages/Home.tsx
var Home_exports$3 = /* @__PURE__ */ __exportAll({ default: () => Home_default$3 });
var Home_default$3 = UNSAFE_withComponentProps(function Home() {
	const { balance, customerName, orders, subscription } = useCustomerStore();
	const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
	const [isTopUpModalOpen, setIsTopUpModalOpen] = useState(false);
	const activeOrderCount = orders.filter((order) => order.status !== "Delivered").length;
	return /* @__PURE__ */ jsxs("div", {
		className: "space-y-6 pb-8",
		children: [
			/* @__PURE__ */ jsxs("div", {
				className: "relative flex flex-col justify-end gap-1 overflow-hidden pb-5 sm:flex-row sm:items-end sm:justify-between",
				children: [
					/* @__PURE__ */ jsx(BubblyBackground, {
						contained: true,
						count: 22,
						opacity: .42,
						scale: 1.8
					}),
					/* @__PURE__ */ jsxs("div", { children: [
						/* @__PURE__ */ jsxs("p", {
							className: "relative text-base font-semibold text-[#00b7d4]",
							children: ["Good morning, ", customerName]
						}),
						/* @__PURE__ */ jsx("h2", {
							className: "mt-1 text-2xl font-bold tracking-tight text-[#121212] lg:hidden",
							children: "Overview"
						}),
						/* @__PURE__ */ jsx("p", {
							className: "mt-1 text-sm text-[#505959]",
							children: "Your laundry, sorted."
						})
					] }),
					/* @__PURE__ */ jsx("p", {
						className: "text-sm text-slate-500",
						children: "Tuesday, 4 Sep 2026"
					})
				]
			}),
			/* @__PURE__ */ jsx("section", {
				className: "relative rounded-2xl overflow-hidden border border-[#e7e7e7] bg-[#f8f8f8] p-5 sm:p-6",
				children: /* @__PURE__ */ jsxs("div", {
					className: "relative",
					children: [
						/* @__PURE__ */ jsxs("div", {
							className: "flex items-start justify-between gap-4",
							children: [/* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("p", {
								className: "text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500",
								children: subscription ? "Subscription" : "Available balance"
							}), subscription ? /* @__PURE__ */ jsxs("p", {
								className: "mt-3 text-3xl font-semibold capitalize tracking-tight text-slate-900 sm:text-4xl",
								children: [
									subscription.name,
									" ",
									subscription.billingPeriod
								]
							}) : /* @__PURE__ */ jsxs(Fragment, { children: [/* @__PURE__ */ jsxs("p", {
								className: `mt-3 text-3xl font-semibold tracking-tight sm:text-4xl ${balance < 0 ? "text-[#d9364e]" : "text-slate-900"}`,
								children: ["₦", Math.abs(balance).toLocaleString()]
							}), balance < 0 && /* @__PURE__ */ jsx("p", {
								className: "mt-1 text-sm font-medium text-[#d9364e]",
								children: "Outstanding order balance"
							})] })] }), /* @__PURE__ */ jsx("span", {
								className: "flex h-9 w-9 items-center justify-center rounded-lg border border-[#e1e1e1] bg-white text-sm",
								children: subscription ? "✦" : "₦"
							})]
						}),
						/* @__PURE__ */ jsxs("div", {
							className: "mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-500",
							children: [/* @__PURE__ */ jsxs("span", { children: ["Added this month ", /* @__PURE__ */ jsx("strong", {
								className: "ml-1 text-slate-800",
								children: "₦25,000"
							})] }), /* @__PURE__ */ jsxs("span", { children: ["Spent ", /* @__PURE__ */ jsx("strong", {
								className: "ml-1 text-slate-800",
								children: "₦12,000"
							})] })]
						}),
						/* @__PURE__ */ jsxs("div", {
							className: "mt-5 flex gap-2",
							children: [/* @__PURE__ */ jsx("button", {
								type: "button",
								onClick: () => setIsTopUpModalOpen(true),
								className: "flex-1 rounded-lg bg-[#00b7d4] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#007f99]",
								children: "Top up"
							}), /* @__PURE__ */ jsx("button", {
								type: "button",
								onClick: () => setIsOrderModalOpen(true),
								className: "flex-1 rounded-lg border border-[#00b7d4] bg-white px-4 py-2.5 text-sm font-semibold text-[#00b7d4] transition hover:bg-[#e8fbfd]",
								children: "New order"
							})]
						})
					]
				})
			}),
			/* @__PURE__ */ jsxs("section", {
				className: "grid gap-3 sm:grid-cols-3",
				children: [
					/* @__PURE__ */ jsxs("div", {
						className: "border rounded-2xl border-[#e7e7e7] bg-white p-4",
						children: [
							/* @__PURE__ */ jsx("p", {
								className: "text-[10px] uppercase tracking-[0.22em] text-slate-400",
								children: "Plan"
							}),
							/* @__PURE__ */ jsx("p", {
								className: "mt-3 text-lg font-semibold text-slate-900",
								children: "Weekly Plus"
							}),
							/* @__PURE__ */ jsx("p", {
								className: "mt-1 text-sm text-slate-500",
								children: "4 bags remaining"
							})
						]
					}),
					/* @__PURE__ */ jsxs("div", {
						className: "border rounded-2xl border-[#e7e7e7] bg-white p-4",
						children: [
							/* @__PURE__ */ jsx("p", {
								className: "text-[10px] uppercase tracking-[0.22em] text-slate-400",
								children: "Active orders"
							}),
							/* @__PURE__ */ jsx("p", {
								className: "mt-3 text-2xl font-semibold text-slate-900",
								children: activeOrderCount
							}),
							/* @__PURE__ */ jsx("p", {
								className: "mt-1 text-sm text-slate-500",
								children: "In progress"
							})
						]
					}),
					/* @__PURE__ */ jsxs("div", {
						className: "border rounded-2xl border-[#e7e7e7] bg-white p-4",
						children: [
							/* @__PURE__ */ jsx("p", {
								className: "text-[10px] uppercase tracking-[0.22em] text-slate-400",
								children: "Pickup"
							}),
							/* @__PURE__ */ jsx("p", {
								className: "mt-3 text-lg font-bold text-slate-900",
								children: "Tomorrow"
							}),
							/* @__PURE__ */ jsx("p", {
								className: "mt-1 text-sm text-slate-500",
								children: "7:00 AM"
							})
						]
					})
				]
			}),
			/* @__PURE__ */ jsxs("section", {
				className: "rounded-2xl border border-[#e7e7e7] bg-white p-4 sm:p-5",
				children: [/* @__PURE__ */ jsxs("div", {
					className: "flex items-center justify-between gap-3",
					children: [/* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("h3", {
						className: "text-lg font-bold text-slate-900",
						children: "Quick access"
					}), /* @__PURE__ */ jsx("p", {
						className: "mt-1 text-sm text-slate-500",
						children: "Go straight to any part of your laundry account."
					})] }), /* @__PURE__ */ jsx(ArrowUpRight, { className: "h-4 w-4 text-[#8e9a9a]" })]
				}), /* @__PURE__ */ jsx("div", {
					className: "mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6",
					children: [
						{
							to: "/orders",
							label: "Orders",
							icon: ClipboardList
						},
						{
							to: "/transactions",
							label: "Transactions",
							icon: CreditCard
						},
						{
							to: "/plans",
							label: "Plans",
							icon: Sparkles
						},
						{
							to: "/invoice",
							label: "Invoice",
							icon: FileText
						},
						{
							to: "/otp",
							label: "Pickup OTP",
							icon: Gift
						},
						{
							to: "/settings",
							label: "Settings",
							icon: Settings2
						}
					].map((item) => {
						const Icon = item.icon;
						return /* @__PURE__ */ jsxs(Link, {
							to: item.to,
							className: "flex min-h-20 flex-col justify-between rounded-2xl border border-slate-200 bg-[#fafafa] p-3 text-left transition hover:border-[#a8eaf0] hover:bg-[#f0fcfd]",
							children: [/* @__PURE__ */ jsx(Icon, { className: "h-4 w-4 text-[#00b7d4]" }), /* @__PURE__ */ jsx("span", {
								className: "text-xs font-semibold text-slate-700",
								children: item.label
							})]
						}, item.to);
					})
				})]
			}),
			/* @__PURE__ */ jsxs("section", {
				className: "border rounded-2xl border-[#e7e7e7] bg-white p-4 sm:p-5",
				children: [/* @__PURE__ */ jsxs("div", {
					className: "flex items-center justify-between",
					children: [/* @__PURE__ */ jsx("h3", {
						className: "text-lg font-bold text-slate-900",
						children: "New order"
					}), /* @__PURE__ */ jsx("button", {
						type: "button",
						onClick: () => setIsOrderModalOpen(true),
						className: "rounded-lg bg-[#e8fbfd] px-2.5 py-1 text-xs font-medium text-[#00b7d4]",
						children: "Start"
					})]
				}), /* @__PURE__ */ jsxs("div", {
					className: "mt-4 flex flex-col gap-4 rounded-2xl border border-[#e7e7e7] bg-[#fafafa] p-4 sm:flex-row sm:items-center sm:justify-between",
					children: [/* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("p", {
						className: "font-semibold text-slate-900",
						children: "Ready for a fresh start?"
					}), /* @__PURE__ */ jsx("p", {
						className: "mt-1 text-sm text-slate-500",
						children: "Choose a service and tell us how many clothes you have."
					})] }), /* @__PURE__ */ jsx("button", {
						type: "button",
						onClick: () => setIsOrderModalOpen(true),
						className: "shrink-0 rounded-lg bg-[#00b7d4] px-4 py-3 text-sm font-semibold text-white",
						children: "Create order"
					})]
				})]
			}),
			/* @__PURE__ */ jsxs("section", {
				className: "border rounded-2xl border-[#e7e7e7] bg-white p-4",
				children: [/* @__PURE__ */ jsxs("div", {
					className: "mb-3 flex items-center justify-between",
					children: [/* @__PURE__ */ jsx("h3", {
						className: "text-lg font-bold text-slate-900",
						children: "Recent orders"
					}), /* @__PURE__ */ jsx("button", {
						type: "button",
						className: "text-sm font-medium text-[#00b7d4]",
						children: "View all"
					})]
				}), /* @__PURE__ */ jsx("div", {
					className: "space-y-3",
					children: orders.slice(0, 3).map((order) => /* @__PURE__ */ jsxs("div", {
						className: "flex items-center justify-between border-b border-[#eeeeee] p-3 last:border-b-0",
						children: [/* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("p", {
							className: "font-semibold text-slate-900",
							children: order.id
						}), /* @__PURE__ */ jsx("p", {
							className: "text-xs text-slate-500",
							children: order.date
						})] }), /* @__PURE__ */ jsxs("div", {
							className: "text-right",
							children: [/* @__PURE__ */ jsxs("p", {
								className: "font-semibold text-slate-900",
								children: ["₦", order.total.toLocaleString()]
							}), /* @__PURE__ */ jsx("p", {
								className: "text-[11px] font-medium text-[#418d87]",
								children: order.status
							})]
						})]
					}, order.id))
				})]
			}),
			isOrderModalOpen && /* @__PURE__ */ jsx(NewOrder, { onClose: () => setIsOrderModalOpen(false) }),
			isTopUpModalOpen && /* @__PURE__ */ jsx(TopUpModal, {
				currentBalance: balance,
				onClose: () => setIsTopUpModalOpen(false)
			})
		]
	});
});
//#endregion
//#region src/portals/customer/pages/Transactions.tsx
var Transactions_exports = /* @__PURE__ */ __exportAll({ default: () => Transactions_default });
var transactions = [
	{
		title: "Wallet top up",
		reference: "via Paystack • QF-8821",
		date: "Today, 09:42 AM",
		amount: "+₦10,000",
		direction: "credit",
		status: "Successful"
	},
	{
		title: "Order payment",
		reference: "QF-1042 • Wash + Iron",
		date: "Yesterday, 04:18 PM",
		amount: "-₦4,800",
		direction: "debit",
		status: "Successful"
	},
	{
		title: "Wallet top up",
		reference: "via Paystack • QF-8794",
		date: "28 Aug 2026, 11:06 AM",
		amount: "+₦15,000",
		direction: "credit",
		status: "Successful"
	},
	{
		title: "Order payment",
		reference: "QF-1038 • Wash",
		date: "27 Aug 2026, 02:35 PM",
		amount: "-₦7,200",
		direction: "debit",
		status: "Successful"
	}
];
var filterItems = [
	"All activity",
	"Top ups",
	"Payments"
];
var Transactions_default = UNSAFE_withComponentProps(function Transactions() {
	return /* @__PURE__ */ jsxs("div", {
		className: "space-y-5 pb-8",
		children: [
			/* @__PURE__ */ jsxs("header", {
				className: "flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between",
				children: [/* @__PURE__ */ jsx("div", { children: /* @__PURE__ */ jsx("h2", {
					className: "mt-1 text-2xl font-bold tracking-tight text-[#121212] lg:hidden",
					children: "Transactions"
				}) }), /* @__PURE__ */ jsx("p", {
					className: "text-sm text-slate-500",
					children: "Your wallet activity"
				})]
			}),
			/* @__PURE__ */ jsx("section", {
				className: "rounded-[26px] border border-slate-200 bg-white p-3 shadow-sm shadow-slate-100 sm:p-4",
				children: /* @__PURE__ */ jsx("div", {
					className: "flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
					children: filterItems.map((item, index) => /* @__PURE__ */ jsx("button", {
						type: "button",
						className: `shrink-0 rounded-full px-4 py-2 text-sm font-medium transition ${index === 0 ? "bg-slate-900 text-white shadow-sm shadow-slate-200" : "bg-slate-50 text-slate-500 hover:bg-sky-50 hover:text-sky-700"}`,
						children: item
					}, item))
				})
			}),
			/* @__PURE__ */ jsxs("section", {
				className: "rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm shadow-slate-100 sm:p-5",
				children: [/* @__PURE__ */ jsxs("div", {
					className: "mb-4 flex items-center justify-between gap-3",
					children: [/* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("h3", {
						className: "text-lg font-bold text-slate-900",
						children: "Recent activity"
					}), /* @__PURE__ */ jsx("p", {
						className: "mt-1 text-sm text-slate-500",
						children: "A record of your wallet and payments"
					})] }), /* @__PURE__ */ jsx("button", {
						type: "button",
						className: "hidden rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:border-sky-200 hover:text-sky-700 sm:block",
						children: "Export"
					})]
				}), /* @__PURE__ */ jsx("div", {
					className: "divide-y divide-slate-100",
					children: transactions.map((transaction) => /* @__PURE__ */ jsxs("div", {
						className: "flex items-center gap-3 py-4 first:pt-1 last:pb-1",
						children: [
							/* @__PURE__ */ jsx("span", {
								className: `flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-lg ${transaction.direction === "credit" ? "bg-emerald-50 text-emerald-600" : "bg-sky-50 text-sky-700"}`,
								children: transaction.direction === "credit" ? "↓" : "↑"
							}),
							/* @__PURE__ */ jsxs("div", {
								className: "min-w-0 flex-1",
								children: [
									/* @__PURE__ */ jsx("p", {
										className: "truncate font-semibold text-slate-900",
										children: transaction.title
									}),
									/* @__PURE__ */ jsx("p", {
										className: "mt-0.5 truncate text-xs text-slate-500",
										children: transaction.reference
									}),
									/* @__PURE__ */ jsx("p", {
										className: "mt-1 text-[11px] text-slate-400",
										children: transaction.date
									})
								]
							}),
							/* @__PURE__ */ jsxs("div", {
								className: "shrink-0 text-right",
								children: [/* @__PURE__ */ jsx("p", {
									className: `font-semibold ${transaction.direction === "credit" ? "text-emerald-600" : "text-slate-900"}`,
									children: transaction.amount
								}), /* @__PURE__ */ jsx("p", {
									className: "mt-1 text-[11px] font-medium text-emerald-600",
									children: transaction.status
								})]
							})
						]
					}, `${transaction.title}-${transaction.date}`))
				})]
			})
		]
	});
});
//#endregion
//#region src/portals/customer/pages/OrderDetailModal.tsx
function OrderDetailModal({ order, onClose }) {
	return /* @__PURE__ */ jsx("div", {
		className: "fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-sm sm:items-center sm:p-4",
		role: "presentation",
		onMouseDown: onClose,
		children: /* @__PURE__ */ jsxs("section", {
			role: "dialog",
			"aria-modal": "true",
			"aria-labelledby": "order-details-title",
			onMouseDown: (event) => event.stopPropagation(),
			className: "max-h-[94vh] w-full overflow-y-auto rounded-t-[30px] bg-slate-50 p-4 shadow-2xl shadow-slate-950/20 sm:max-w-2xl sm:rounded-[30px] sm:p-6",
			children: [
				/* @__PURE__ */ jsxs("header", {
					className: "flex items-start justify-between gap-3",
					children: [/* @__PURE__ */ jsx("div", { children: /* @__PURE__ */ jsx("h2", {
						id: "order-details-title",
						className: "mt-1 text-2xl font-bold tracking-tight text-[#121212]",
						children: order.id
					}) }), /* @__PURE__ */ jsx("button", {
						type: "button",
						onClick: onClose,
						"aria-label": "Close order details",
						className: "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-xl text-slate-500 shadow-sm transition hover:border-violet-200 hover:text-violet-700",
						children: "×"
					})]
				}),
				/* @__PURE__ */ jsxs("div", {
					className: "mt-5 rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm shadow-slate-100 sm:p-5",
					children: [/* @__PURE__ */ jsxs("div", {
						className: "flex items-center justify-between gap-3",
						children: [/* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("p", {
							className: "text-[10px] uppercase tracking-[0.22em] text-slate-400",
							children: "Status"
						}), /* @__PURE__ */ jsx("p", {
							className: "mt-2 text-lg font-bold text-slate-900",
							children: order.status
						})] }), /* @__PURE__ */ jsx("span", {
							className: `inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${order.statusTone}`,
							children: order.paymentStatus
						})]
					}), /* @__PURE__ */ jsxs("div", {
						className: "mt-5 grid gap-3 sm:grid-cols-2",
						children: [/* @__PURE__ */ jsxs("div", {
							className: "rounded-2xl bg-slate-50 p-3",
							children: [/* @__PURE__ */ jsx("p", {
								className: "text-[10px] uppercase tracking-[0.22em] text-slate-400",
								children: "Pickup OTP"
							}), /* @__PURE__ */ jsx("p", {
								className: "mt-2 text-2xl font-bold tracking-[0.18em] text-slate-900",
								children: order.pickupOtp
							})]
						}), /* @__PURE__ */ jsxs("div", {
							className: "rounded-2xl bg-slate-50 p-3",
							children: [/* @__PURE__ */ jsx("p", {
								className: "text-[10px] uppercase tracking-[0.22em] text-slate-400",
								children: "Delivery OTP"
							}), /* @__PURE__ */ jsx("p", {
								className: "mt-2 text-2xl font-bold tracking-[0.18em] text-slate-900",
								children: order.deliveryOtp ?? "Pending"
							})]
						})]
					})]
				}),
				/* @__PURE__ */ jsxs("div", {
					className: "mt-5 grid gap-4 lg:grid-cols-2",
					children: [/* @__PURE__ */ jsxs("div", {
						className: "rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm shadow-slate-100 sm:p-5",
						children: [/* @__PURE__ */ jsx("h3", {
							className: "text-lg font-bold text-slate-900",
							children: "Order summary"
						}), /* @__PURE__ */ jsxs("dl", {
							className: "mt-4 space-y-3 text-sm text-slate-600",
							children: [
								/* @__PURE__ */ jsxs("div", {
									className: "flex items-center justify-between gap-3",
									children: [/* @__PURE__ */ jsx("dt", { children: "Service" }), /* @__PURE__ */ jsx("dd", {
										className: "font-semibold text-slate-900",
										children: order.service
									})]
								}),
								/* @__PURE__ */ jsxs("div", {
									className: "flex items-center justify-between gap-3",
									children: [/* @__PURE__ */ jsx("dt", { children: "Items" }), /* @__PURE__ */ jsxs("dd", {
										className: "font-semibold text-slate-900",
										children: [order.items, " clothes"]
									})]
								}),
								/* @__PURE__ */ jsxs("div", {
									className: "flex items-center justify-between gap-3",
									children: [/* @__PURE__ */ jsx("dt", { children: "Total" }), /* @__PURE__ */ jsxs("dd", {
										className: "font-semibold text-slate-900",
										children: ["₦", order.total.toLocaleString()]
									})]
								}),
								/* @__PURE__ */ jsxs("div", {
									className: "flex items-center justify-between gap-3",
									children: [/* @__PURE__ */ jsx("dt", { children: "Customer ID" }), /* @__PURE__ */ jsx("dd", {
										className: "font-semibold text-slate-900",
										children: order.customerId
									})]
								})
							]
						})]
					}), /* @__PURE__ */ jsxs("div", {
						className: "rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm shadow-slate-100 sm:p-5",
						children: [/* @__PURE__ */ jsx("h3", {
							className: "text-lg font-bold text-slate-900",
							children: "Pickup details"
						}), /* @__PURE__ */ jsxs("dl", {
							className: "mt-4 space-y-3 text-sm text-slate-600",
							children: [
								/* @__PURE__ */ jsxs("div", {
									className: "flex items-center justify-between gap-3",
									children: [/* @__PURE__ */ jsx("dt", { children: "Picked up" }), /* @__PURE__ */ jsx("dd", {
										className: "font-semibold text-slate-900",
										children: order.pickedUp ? "Yes" : "No"
									})]
								}),
								/* @__PURE__ */ jsxs("div", {
									className: "flex items-center justify-between gap-3",
									children: [/* @__PURE__ */ jsx("dt", { children: "Pickup date" }), /* @__PURE__ */ jsx("dd", {
										className: "font-semibold text-slate-900",
										children: order.pickupDate ?? "Not confirmed yet"
									})]
								}),
								/* @__PURE__ */ jsxs("div", {
									className: "flex items-center justify-between gap-3",
									children: [/* @__PURE__ */ jsx("dt", { children: "Pickup time" }), /* @__PURE__ */ jsx("dd", {
										className: "font-semibold text-slate-900",
										children: order.pickup
									})]
								})
							]
						})]
					})]
				}),
				/* @__PURE__ */ jsxs("div", {
					className: "mt-5 rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm shadow-slate-100 sm:p-5",
					children: [/* @__PURE__ */ jsx("h3", {
						className: "text-lg font-bold text-slate-900",
						children: "Notes"
					}), /* @__PURE__ */ jsx("p", {
						className: "mt-3 text-sm leading-6 text-slate-600",
						children: order.notes
					})]
				})
			]
		})
	});
}
//#endregion
//#region src/portals/customer/pages/Orders.tsx
var Orders_exports = /* @__PURE__ */ __exportAll({ default: () => Orders_default });
var Orders_default = UNSAFE_withComponentProps(function Orders() {
	const { orders } = useCustomerStore();
	const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
	const [selectedOrder, setSelectedOrder] = useState(null);
	const [activeFilter, setActiveFilter] = useState("All orders");
	const filteredOrders = orders.filter((order) => {
		if (activeFilter === "Active") return order.status !== "Delivered";
		if (activeFilter === "Completed") return order.status === "Delivered";
		if (activeFilter === "Pending payment") return order.paymentStatus === "Pending";
		return true;
	});
	const stats = [
		{
			label: "Total orders",
			value: String(orders.length),
			helper: "In your history"
		},
		{
			label: "Active",
			value: String(orders.filter((order) => order.status !== "Delivered").length).padStart(2, "0"),
			helper: "In progress"
		},
		{
			label: "Delivered",
			value: String(orders.filter((order) => order.status === "Delivered").length),
			helper: "Completed"
		},
		{
			label: "Spend",
			value: `₦${orders.reduce((total, order) => total + order.total, 0).toLocaleString()}`,
			helper: "Across all orders"
		}
	];
	return /* @__PURE__ */ jsxs("div", {
		className: "space-y-6 pb-8",
		children: [
			/* @__PURE__ */ jsxs("header", {
				className: "flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between",
				children: [/* @__PURE__ */ jsx("div", { children: /* @__PURE__ */ jsx("h2", {
					className: "mt-1 text-2xl font-bold tracking-tight text-[#121212] lg:hidden",
					children: "Orders"
				}) }), /* @__PURE__ */ jsx("button", {
					type: "button",
					onClick: () => setIsOrderModalOpen(true),
					className: "rounded-lg bg-[#00b7d4] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#007f99]",
					children: "New order"
				})]
			}),
			/* @__PURE__ */ jsx("section", {
				className: "grid gap-3 sm:grid-cols-2 xl:grid-cols-4",
				children: stats.map((stat) => /* @__PURE__ */ jsxs("div", {
					className: "rounded-2xl border border-[#e7e7e7] bg-white p-4",
					children: [
						/* @__PURE__ */ jsx("p", {
							className: "text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400",
							children: stat.label
						}),
						/* @__PURE__ */ jsx("p", {
							className: "mt-3 text-2xl font-semibold text-slate-900",
							children: stat.value
						}),
						/* @__PURE__ */ jsx("p", {
							className: "mt-1 text-sm text-slate-500",
							children: stat.helper
						})
					]
				}, stat.label))
			}),
			/* @__PURE__ */ jsx("section", {
				className: "rounded-2xl border border-[#e7e7e7] bg-white p-3 sm:p-4",
				children: /* @__PURE__ */ jsx("div", {
					className: "flex flex-wrap gap-2",
					children: [
						"All orders",
						"Active",
						"Completed",
						"Pending payment"
					].map((filter) => /* @__PURE__ */ jsx("button", {
						type: "button",
						onClick: () => setActiveFilter(filter),
						className: `rounded-full px-4 py-2 text-sm font-medium transition ${activeFilter === filter ? "bg-[#e8fbfd] text-[#00b7d4] ring-1 ring-[#a8eaf0]" : "bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-900"}`,
						children: filter
					}, filter))
				})
			}),
			/* @__PURE__ */ jsxs("section", {
				className: "rounded-2xl border border-[#e7e7e7] bg-white p-4 sm:p-5",
				children: [/* @__PURE__ */ jsxs("div", {
					className: "mb-4 flex items-center justify-between gap-3",
					children: [/* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("h3", {
						className: "text-lg font-bold text-slate-900",
						children: "Recent orders"
					}), /* @__PURE__ */ jsx("p", {
						className: "mt-1 text-sm text-slate-500",
						children: "Track pickup, delivery, and payment status"
					})] }), /* @__PURE__ */ jsx("button", {
						type: "button",
						className: "text-sm font-medium text-[#00b7d4]",
						children: "Export"
					})]
				}), /* @__PURE__ */ jsxs("div", {
					className: "space-y-3",
					children: [filteredOrders.map((order) => /* @__PURE__ */ jsxs("article", {
						className: "border-b border-[#eeeeee] bg-white p-4 last:border-b-0",
						children: [/* @__PURE__ */ jsxs("div", {
							className: "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between",
							children: [/* @__PURE__ */ jsxs("div", { children: [
								/* @__PURE__ */ jsxs("div", {
									className: "flex items-center gap-2",
									children: [/* @__PURE__ */ jsx("p", {
										className: "text-lg font-semibold text-slate-900",
										children: order.id
									}), /* @__PURE__ */ jsx("span", {
										className: `inline-flex rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${order.statusTone}`,
										children: order.status
									})]
								}),
								/* @__PURE__ */ jsx("p", {
									className: "mt-2 text-sm font-medium text-slate-700",
									children: order.title
								}),
								/* @__PURE__ */ jsx("p", {
									className: "mt-1 text-xs text-slate-500",
									children: order.date
								})
							] }), /* @__PURE__ */ jsxs("div", {
								className: "text-left sm:text-right",
								children: [/* @__PURE__ */ jsxs("p", {
									className: "text-xl font-bold text-slate-900",
									children: ["₦", order.total.toLocaleString()]
								}), /* @__PURE__ */ jsxs("p", {
									className: "mt-1 text-xs text-slate-500",
									children: [order.items, " clothes"]
								})]
							})]
						}), /* @__PURE__ */ jsxs("div", {
							className: "mt-4 flex flex-col gap-3 border-t border-slate-200 pt-3 sm:flex-row sm:items-center sm:justify-between",
							children: [/* @__PURE__ */ jsx("p", {
								className: "text-sm text-slate-600",
								children: order.pickup
							}), /* @__PURE__ */ jsx("button", {
								type: "button",
								onClick: () => setSelectedOrder(order),
								className: "rounded-lg border border-[#a8eaf0] bg-white px-3.5 py-2 text-sm font-semibold text-[#00b7d4] hover:bg-[#e8fbfd]",
								children: order.action
							})]
						})]
					}, order.id)), filteredOrders.length === 0 && /* @__PURE__ */ jsx("p", {
						className: "rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-500",
						children: "No orders match this filter."
					})]
				})]
			}),
			isOrderModalOpen && /* @__PURE__ */ jsx(NewOrder, { onClose: () => setIsOrderModalOpen(false) }),
			selectedOrder && /* @__PURE__ */ jsx(OrderDetailModal, {
				order: selectedOrder,
				onClose: () => setSelectedOrder(null)
			})
		]
	});
});
//#endregion
//#region src/portals/customer/pages/Plans.tsx
var Plans_exports = /* @__PURE__ */ __exportAll({ default: () => Plans_default });
var plans = [
	{
		id: "lite-monthly",
		name: "Lite",
		billingPeriod: "monthly",
		price: 18e3,
		currency: "NGN",
		weeklyLimit: 20,
		service: "Wash only",
		description: "A simple monthly plan for lighter laundry routines.",
		benefits: [
			"Professional cleaning",
			"Scheduled pickup",
			"Quick turnaround"
		],
		featured: false
	},
	{
		id: "silver-monthly",
		name: "Silver",
		billingPeriod: "monthly",
		price: 27e3,
		currency: "NGN",
		weeklyLimit: 20,
		service: "Wash + Iron",
		description: "More care for households with a steady weekly load.",
		benefits: [
			"Professional cleaning",
			"Scheduled pickup",
			"Priority wash queue"
		],
		featured: true
	},
	{
		id: "gold-monthly",
		name: "Gold",
		billingPeriod: "monthly",
		price: 33e3,
		currency: "NGN",
		weeklyLimit: 25,
		service: "Wash + Iron",
		description: "Extra weekly capacity for larger laundry routines.",
		benefits: [
			"Professional cleaning",
			"Priority pickup",
			"Extra garment care"
		],
		featured: false
	},
	{
		id: "lite-semester",
		name: "Lite",
		billingPeriod: "semester",
		price: 1e5,
		currency: "NGN",
		weeklyLimit: 20,
		service: "Wash only",
		description: "A semester plan for lighter weekly laundry.",
		benefits: [
			"Professional cleaning",
			"Scheduled pickup",
			"Quick turnaround"
		],
		featured: false
	},
	{
		id: "silver-semester",
		name: "Silver",
		billingPeriod: "semester",
		price: 15e4,
		currency: "NGN",
		weeklyLimit: 20,
		service: "Wash + Iron",
		description: "Consistent care for households throughout the semester.",
		benefits: [
			"Professional cleaning",
			"Scheduled pickup",
			"Priority wash queue"
		],
		featured: true
	},
	{
		id: "gold-semester",
		name: "Gold",
		billingPeriod: "semester",
		price: 185e3,
		currency: "NGN",
		weeklyLimit: 25,
		service: "Wash + Iron",
		description: "The highest weekly limit for larger households.",
		benefits: [
			"Professional cleaning",
			"Priority pickup",
			"Extra garment care"
		],
		featured: false
	}
];
var currentPlanId = "silver-semester";
function formatPrice(price) {
	return `₦${price.toLocaleString()}`;
}
var Plans_default = UNSAFE_withComponentProps(function Plans() {
	const [billingPeriod, setBillingPeriod] = useState("semester");
	const visiblePlans = plans.filter((plan) => plan.billingPeriod === billingPeriod);
	const currentPlan = plans.find((plan) => plan.id === currentPlanId);
	return /* @__PURE__ */ jsxs("div", {
		className: "space-y-6 pb-8",
		children: [
			/* @__PURE__ */ jsxs("header", {
				className: "flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between",
				children: [/* @__PURE__ */ jsx("h2", {
					className: "mt-1 text-2xl font-bold tracking-tight text-[#121212] lg:hidden",
					children: "Plans"
				}), /* @__PURE__ */ jsx("p", {
					className: "text-sm text-slate-500",
					children: "Choose a plan that fits your routine"
				})]
			}),
			currentPlan && /* @__PURE__ */ jsxs("section", {
				className: "rounded-2xl border border-[#a7d7d2] bg-[#eef9f7] p-5 text-slate-900 sm:p-6",
				children: [/* @__PURE__ */ jsxs("div", {
					className: "flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between",
					children: [/* @__PURE__ */ jsxs("div", { children: [
						/* @__PURE__ */ jsx("p", {
							className: "text-xs font-semibold uppercase tracking-[0.16em] text-[#418d87]",
							children: "Current plan"
						}),
						/* @__PURE__ */ jsxs("div", {
							className: "mt-3 flex items-center gap-2",
							children: [/* @__PURE__ */ jsx("h3", {
								className: "text-2xl font-bold",
								children: currentPlan.name
							}), /* @__PURE__ */ jsx("span", {
								className: "rounded-full bg-white px-2.5 py-1 text-xs font-semibold capitalize text-[#418d87]",
								children: currentPlan.billingPeriod
							})]
						}),
						/* @__PURE__ */ jsxs("p", {
							className: "mt-2 text-sm text-slate-600",
							children: [
								currentPlan.service,
								" · ",
								currentPlan.weeklyLimit,
								" clothes per week"
							]
						})
					] }), /* @__PURE__ */ jsxs("div", {
						className: "text-left sm:text-right",
						children: [/* @__PURE__ */ jsx("p", {
							className: "text-sm font-semibold text-slate-900",
							children: "Renews on 12 Sep"
						}), /* @__PURE__ */ jsx("p", {
							className: "mt-1 text-xs text-slate-500",
							children: "4 clothes remaining this week"
						})]
					})]
				}), /* @__PURE__ */ jsx("div", {
					className: "mt-5 h-2 overflow-hidden rounded-full bg-[#d3ebe8]",
					children: /* @__PURE__ */ jsx("div", { className: "h-full w-4/5 rounded-full bg-[#55aaa3]" })
				})]
			}),
			/* @__PURE__ */ jsxs("section", {
				className: "flex flex-col gap-4 border-b border-[#e7e7e7] pb-4 sm:flex-row sm:items-center sm:justify-between",
				children: [/* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("h3", {
					className: "text-lg font-bold text-[#121212]",
					children: "Available plans"
				}), /* @__PURE__ */ jsx("p", {
					className: "mt-1 text-sm text-slate-500",
					children: "Plans are grouped by their billing period."
				})] }), /* @__PURE__ */ jsx("div", {
					className: "flex rounded-2xl border border-[#e7e7e7] bg-white p-1",
					role: "tablist",
					"aria-label": "Plan billing period",
					children: ["monthly", "semester"].map((period) => /* @__PURE__ */ jsx("button", {
						type: "button",
						role: "tab",
						"aria-selected": billingPeriod === period,
						onClick: () => setBillingPeriod(period),
						className: `rounded-2xl px-4 py-2 text-sm font-semibold capitalize transition ${billingPeriod === period ? "bg-[#e8fbfd] text-[#00b7d4]" : "text-slate-500 hover:text-slate-900"}`,
						children: period
					}, period))
				})]
			}),
			/* @__PURE__ */ jsx("section", {
				className: "grid gap-4 xl:grid-cols-3",
				children: visiblePlans.map((plan) => {
					const isCurrent = plan.id === currentPlanId;
					return /* @__PURE__ */ jsxs("article", {
						className: `relative flex flex-col rounded-2xl border p-5 shadow-sm ${plan.featured ? "border-[#00b7d4] bg-[#f0fcfd]" : "border-[#e7e7e7] bg-white"}`,
						children: [
							plan.featured && /* @__PURE__ */ jsx("span", {
								className: "absolute right-5 top-5 rounded-full bg-[#00b7d4] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white",
								children: "Popular"
							}),
							/* @__PURE__ */ jsxs("div", {
								className: "pr-16",
								children: [/* @__PURE__ */ jsx("p", {
									className: "text-sm font-semibold text-[#00b7d4]",
									children: plan.name
								}), /* @__PURE__ */ jsxs("div", {
									className: "mt-3 flex items-baseline gap-1.5",
									children: [/* @__PURE__ */ jsx("span", {
										className: "text-3xl font-bold text-[#121212]",
										children: formatPrice(plan.price)
									}), /* @__PURE__ */ jsxs("span", {
										className: "text-sm text-slate-500",
										children: ["/", plan.billingPeriod]
									})]
								})]
							}),
							/* @__PURE__ */ jsx("p", {
								className: "mt-4 min-h-10 text-sm leading-5 text-slate-600",
								children: plan.description
							}),
							/* @__PURE__ */ jsxs("div", {
								className: "mt-5 grid gap-2 border-y border-[#eeeeee] py-4 text-sm",
								children: [/* @__PURE__ */ jsxs("div", {
									className: "flex items-center justify-between",
									children: [/* @__PURE__ */ jsx("span", {
										className: "text-slate-500",
										children: "Weekly limit"
									}), /* @__PURE__ */ jsxs("span", {
										className: "font-semibold text-slate-900",
										children: [plan.weeklyLimit, " clothes"]
									})]
								}), /* @__PURE__ */ jsxs("div", {
									className: "flex items-center justify-between",
									children: [/* @__PURE__ */ jsx("span", {
										className: "text-slate-500",
										children: "Service"
									}), /* @__PURE__ */ jsx("span", {
										className: "font-semibold text-slate-900",
										children: plan.service
									})]
								})]
							}),
							/* @__PURE__ */ jsx("ul", {
								className: "mt-5 flex-1 space-y-3",
								children: plan.benefits.map((benefit) => /* @__PURE__ */ jsxs("li", {
									className: "flex items-start gap-2 text-sm text-slate-700",
									children: [/* @__PURE__ */ jsx("span", {
										className: "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#d8f3e9] text-[#418d87]",
										children: /* @__PURE__ */ jsx(Check, { className: "h-3 w-3" })
									}), /* @__PURE__ */ jsx("span", { children: benefit })]
								}, benefit))
							}),
							/* @__PURE__ */ jsx("button", {
								type: "button",
								disabled: isCurrent,
								className: `mt-6 flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition ${isCurrent ? "cursor-default bg-[#eef9f7] text-[#418d87]" : plan.featured ? "bg-[#00b7d4] text-white hover:bg-[#007f99]" : "border border-[#a8eaf0] bg-white text-[#00b7d4] hover:bg-[#e8fbfd]"}`,
								children: isCurrent ? /* @__PURE__ */ jsxs(Fragment, { children: ["Current plan ", /* @__PURE__ */ jsx(Check, { className: "h-4 w-4" })] }) : /* @__PURE__ */ jsxs(Fragment, { children: ["Choose plan ", /* @__PURE__ */ jsx(ChevronRight, { className: "h-4 w-4" })] })
							})
						]
					}, plan.id);
				})
			}),
			/* @__PURE__ */ jsxs("section", {
				className: "flex items-start gap-3 rounded-2xl border border-[#e7e7e7] bg-white p-4 text-sm text-slate-600",
				children: [
					/* @__PURE__ */ jsx(Clock3, { className: "mt-0.5 h-4 w-4 shrink-0 text-[#418d87]" }),
					/* @__PURE__ */ jsx("p", { children: "Pay ahead for your next plan and it will begin after your current plan ends. Clothes above the weekly limit are billed separately." }),
					/* @__PURE__ */ jsx(Sparkles, { className: "ml-auto mt-0.5 hidden h-4 w-4 shrink-0 text-[#00b7d4] sm:block" })
				]
			})
		]
	});
});
//#endregion
//#region src/portals/customer/pages/Settings.tsx
var Settings_exports = /* @__PURE__ */ __exportAll({ default: () => Settings_default });
var quickStats = [
	{
		label: "Phone",
		value: "+234 801 234 5678",
		helper: "Primary number"
	},
	{
		label: "Referral code",
		value: "QFY-AISHA",
		helper: "Share to earn"
	},
	{
		label: "Plan status",
		value: "Active",
		helper: "Weekly Plus"
	},
	{
		label: "Next renewal",
		value: "12 Sep",
		helper: "Auto-renews"
	}
];
var recentPayments = [
	{
		title: "Weekly Plus",
		date: "04 Sep 2026",
		amount: "₦6,500",
		status: "Paid"
	},
	{
		title: "Extra bags",
		date: "28 Aug 2026",
		amount: "₦1,800",
		status: "Paid"
	},
	{
		title: "Pickup fee",
		date: "22 Aug 2026",
		amount: "₦600",
		status: "Pending"
	}
];
var Settings_default = UNSAFE_withComponentProps(function Settings() {
	return /* @__PURE__ */ jsxs("div", {
		className: "space-y-5 pb-8",
		children: [
			/* @__PURE__ */ jsxs("header", {
				className: "flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between",
				children: [/* @__PURE__ */ jsx("div", { children: /* @__PURE__ */ jsx("h2", {
					className: "mt-1 text-2xl font-bold tracking-tight text-[#121212] lg:hidden",
					children: "Settings"
				}) }), /* @__PURE__ */ jsx("p", {
					className: "text-sm text-slate-500",
					children: "Manage your profile and billing"
				})]
			}),
			/* @__PURE__ */ jsx("section", {
				className: "rounded-[28px] bg-gradient-to-br from-violet-600 via-violet-700 to-fuchsia-500 p-5 text-white shadow-lg shadow-violet-200 sm:p-6",
				children: /* @__PURE__ */ jsxs("div", {
					className: "flex items-start justify-between gap-4",
					children: [/* @__PURE__ */ jsxs("div", { children: [
						/* @__PURE__ */ jsx("p", {
							className: "text-xs font-medium uppercase tracking-[0.18em] text-violet-100",
							children: "Profile"
						}),
						/* @__PURE__ */ jsx("h3", {
							className: "mt-3 text-3xl font-bold",
							children: "Aisha Bello"
						}),
						/* @__PURE__ */ jsx("p", {
							className: "mt-2 text-sm text-violet-100",
							children: "aisha@qaffy.app • QF-2048"
						})
					] }), /* @__PURE__ */ jsx("div", {
						className: "flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 text-2xl backdrop-blur-sm",
						children: "A"
					})]
				})
			}),
			/* @__PURE__ */ jsx("section", {
				className: "grid gap-3 sm:grid-cols-2 xl:grid-cols-4",
				children: quickStats.map((stat) => /* @__PURE__ */ jsxs("div", {
					className: "rounded-[22px] border border-violet-100 bg-white p-4 shadow-sm shadow-violet-50",
					children: [
						/* @__PURE__ */ jsx("p", {
							className: "text-[10px] uppercase tracking-[0.22em] text-slate-400",
							children: stat.label
						}),
						/* @__PURE__ */ jsx("p", {
							className: "mt-3 text-lg font-bold text-slate-900",
							children: stat.value
						}),
						/* @__PURE__ */ jsx("p", {
							className: "mt-1 text-sm text-slate-500",
							children: stat.helper
						})
					]
				}, stat.label))
			}),
			/* @__PURE__ */ jsxs("section", {
				className: "grid gap-4 lg:grid-cols-[1.2fr_0.8fr]",
				children: [/* @__PURE__ */ jsxs("div", {
					className: "rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm shadow-slate-100 sm:p-5",
					children: [/* @__PURE__ */ jsxs("div", {
						className: "flex items-center justify-between gap-3",
						children: [/* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("h3", {
							className: "text-lg font-bold text-slate-900",
							children: "Profile details"
						}), /* @__PURE__ */ jsx("p", {
							className: "mt-1 text-sm text-slate-500",
							children: "Keep your account info current"
						})] }), /* @__PURE__ */ jsx("button", {
							type: "button",
							className: "rounded-full border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-semibold text-violet-700",
							children: "Edit"
						})]
					}), /* @__PURE__ */ jsxs("div", {
						className: "mt-5 space-y-4",
						children: [
							/* @__PURE__ */ jsxs("label", {
								className: "block",
								children: [/* @__PURE__ */ jsx("span", {
									className: "mb-1.5 block text-sm font-medium text-slate-600",
									children: "Full name"
								}), /* @__PURE__ */ jsx("input", {
									defaultValue: "Aisha Bello",
									readOnly: true,
									"aria-readonly": "true",
									className: "w-full cursor-not-allowed rounded-2xl border border-slate-200 bg-slate-100 px-3 py-3 text-base text-slate-500 focus:border-slate-200 focus:ring-0"
								})]
							}),
							/* @__PURE__ */ jsxs("label", {
								className: "block",
								children: [/* @__PURE__ */ jsx("span", {
									className: "mb-1.5 block text-sm font-medium text-slate-600",
									children: "Phone number"
								}), /* @__PURE__ */ jsx("input", {
									defaultValue: "+234 801 234 5678",
									className: "w-full rounded-2xl border border-violet-200 bg-white px-3 py-3 text-base text-slate-900 focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
								})]
							}),
							/* @__PURE__ */ jsxs("label", {
								className: "block",
								children: [/* @__PURE__ */ jsx("span", {
									className: "mb-1.5 block text-sm font-medium text-slate-600",
									children: "Email address"
								}), /* @__PURE__ */ jsx("input", {
									defaultValue: "aisha@qaffy.app",
									readOnly: true,
									"aria-readonly": "true",
									className: "w-full cursor-not-allowed rounded-2xl border border-slate-200 bg-slate-100 px-3 py-3 text-base text-slate-500 focus:border-slate-200 focus:ring-0"
								})]
							})
						]
					})]
				}), /* @__PURE__ */ jsxs("div", {
					className: "rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm shadow-slate-100 sm:p-5",
					children: [/* @__PURE__ */ jsx("h3", {
						className: "text-lg font-bold text-slate-900",
						children: "Billing & rewards"
					}), /* @__PURE__ */ jsxs("div", {
						className: "mt-4 space-y-3",
						children: [
							/* @__PURE__ */ jsxs("button", {
								type: "button",
								className: "flex w-full items-center justify-between rounded-2xl bg-slate-50 px-3.5 py-3 text-left text-sm font-medium text-slate-700 hover:bg-violet-50 hover:text-violet-700",
								children: [/* @__PURE__ */ jsx("span", { children: "Payment method" }), /* @__PURE__ */ jsx("span", { children: "Visa •••• 2094" })]
							}),
							/* @__PURE__ */ jsxs("button", {
								type: "button",
								className: "flex w-full items-center justify-between rounded-2xl bg-slate-50 px-3.5 py-3 text-left text-sm font-medium text-slate-700 hover:bg-violet-50 hover:text-violet-700",
								children: [/* @__PURE__ */ jsx("span", { children: "Referral program" }), /* @__PURE__ */ jsx("span", { children: "Earn 10%" })]
							}),
							/* @__PURE__ */ jsxs("button", {
								type: "button",
								className: "flex w-full items-center justify-between rounded-2xl bg-slate-50 px-3.5 py-3 text-left text-sm font-medium text-slate-700 hover:bg-violet-50 hover:text-violet-700",
								children: [/* @__PURE__ */ jsx("span", { children: "Notifications" }), /* @__PURE__ */ jsx("span", { children: "Enabled" })]
							})
						]
					})]
				})]
			}),
			/* @__PURE__ */ jsxs("section", {
				className: "rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm shadow-slate-100 sm:p-5",
				children: [/* @__PURE__ */ jsxs("div", {
					className: "mb-4 flex items-center justify-between gap-3",
					children: [/* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("h3", {
						className: "text-lg font-bold text-slate-900",
						children: "Recent payments"
					}), /* @__PURE__ */ jsx("p", {
						className: "mt-1 text-sm text-slate-500",
						children: "Your latest plan and service payments"
					})] }), /* @__PURE__ */ jsx("button", {
						type: "button",
						className: "text-sm font-medium text-violet-600",
						children: "View all"
					})]
				}), /* @__PURE__ */ jsx("div", {
					className: "space-y-3",
					children: recentPayments.map((payment) => /* @__PURE__ */ jsxs("div", {
						className: "flex items-center justify-between rounded-2xl bg-slate-50 p-3",
						children: [/* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("p", {
							className: "font-semibold text-slate-900",
							children: payment.title
						}), /* @__PURE__ */ jsx("p", {
							className: "mt-1 text-xs text-slate-500",
							children: payment.date
						})] }), /* @__PURE__ */ jsxs("div", {
							className: "text-right",
							children: [/* @__PURE__ */ jsx("p", {
								className: "font-semibold text-slate-900",
								children: payment.amount
							}), /* @__PURE__ */ jsx("p", {
								className: `mt-1 text-[11px] font-medium ${payment.status === "Paid" ? "text-emerald-600" : "text-amber-600"}`,
								children: payment.status
							})]
						})]
					}, `${payment.title}-${payment.date}`))
				})]
			})
		]
	});
});
//#endregion
//#region src/portals/customer/pages/Invoice.tsx
var Invoice_exports = /* @__PURE__ */ __exportAll({ default: () => Invoice_default });
var invoiceItems = [
	{
		label: "Wash + Iron",
		quantity: "6 clothes",
		amount: "₦4,800"
	},
	{
		label: "Pickup fee",
		quantity: "Standard",
		amount: "₦600"
	},
	{
		label: "Express handling",
		quantity: "Priority",
		amount: "₦1,200"
	}
];
var paymentBreakdown = [
	{
		label: "Subtotal",
		value: "₦4,800"
	},
	{
		label: "Pickup",
		value: "₦600"
	},
	{
		label: "Handling",
		value: "₦1,200"
	},
	{
		label: "Discount",
		value: "-₦600"
	}
];
var Invoice_default = UNSAFE_withComponentProps(function Invoice() {
	return /* @__PURE__ */ jsxs("div", {
		className: "space-y-5 pb-8",
		children: [
			/* @__PURE__ */ jsxs("header", {
				className: "flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between",
				children: [/* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("p", {
					className: "text-sm font-medium text-violet-600",
					children: "Billing"
				}), /* @__PURE__ */ jsx("h2", {
					className: "mt-1 text-2xl font-bold tracking-tight text-[#121212] lg:hidden",
					children: "Invoice"
				})] }), /* @__PURE__ */ jsx("span", {
					className: "rounded-full bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-700",
					children: "Awaiting payment"
				})]
			}),
			/* @__PURE__ */ jsx("section", {
				className: "rounded-[28px] bg-gradient-to-br from-slate-950 via-violet-950 to-violet-700 p-5 text-white shadow-lg shadow-violet-200 sm:p-6",
				children: /* @__PURE__ */ jsxs("div", {
					className: "flex items-start justify-between gap-4",
					children: [/* @__PURE__ */ jsxs("div", { children: [
						/* @__PURE__ */ jsx("p", {
							className: "text-xs font-medium uppercase tracking-[0.18em] text-violet-200",
							children: "Order reference"
						}),
						/* @__PURE__ */ jsx("h3", {
							className: "mt-3 text-3xl font-bold",
							children: "QF-1042"
						}),
						/* @__PURE__ */ jsx("p", {
							className: "mt-2 text-sm text-violet-100",
							children: "Pickup scheduled for Friday • 8:00 AM"
						})
					] }), /* @__PURE__ */ jsx("div", {
						className: "rounded-2xl bg-white/10 px-3 py-2 text-sm font-medium text-violet-50",
						children: "Due today"
					})]
				})
			}),
			/* @__PURE__ */ jsxs("section", {
				className: "grid gap-4 lg:grid-cols-[1fr_0.8fr]",
				children: [/* @__PURE__ */ jsxs("div", {
					className: "rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm shadow-slate-100 sm:p-5",
					children: [/* @__PURE__ */ jsxs("div", {
						className: "flex items-center justify-between gap-3",
						children: [/* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("h3", {
							className: "text-lg font-bold text-slate-900",
							children: "Laundry summary"
						}), /* @__PURE__ */ jsx("p", {
							className: "mt-1 text-sm text-slate-500",
							children: "This invoice reflects your active bag count"
						})] }), /* @__PURE__ */ jsx("button", {
							type: "button",
							className: "rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-600",
							children: "Download"
						})]
					}), /* @__PURE__ */ jsx("div", {
						className: "mt-5 space-y-3",
						children: invoiceItems.map((item) => /* @__PURE__ */ jsxs("div", {
							className: "flex items-center justify-between rounded-2xl bg-slate-50 p-3",
							children: [/* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("p", {
								className: "font-semibold text-slate-900",
								children: item.label
							}), /* @__PURE__ */ jsx("p", {
								className: "mt-1 text-xs text-slate-500",
								children: item.quantity
							})] }), /* @__PURE__ */ jsx("p", {
								className: "font-semibold text-slate-900",
								children: item.amount
							})]
						}, item.label))
					})]
				}), /* @__PURE__ */ jsxs("div", {
					className: "rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm shadow-slate-100 sm:p-5",
					children: [
						/* @__PURE__ */ jsx("h3", {
							className: "text-lg font-bold text-slate-900",
							children: "Payment breakdown"
						}),
						/* @__PURE__ */ jsx("div", {
							className: "mt-4 space-y-3",
							children: paymentBreakdown.map((item) => /* @__PURE__ */ jsxs("div", {
								className: "flex items-center justify-between text-sm text-slate-600",
								children: [/* @__PURE__ */ jsx("span", { children: item.label }), /* @__PURE__ */ jsx("span", {
									className: "font-semibold text-slate-900",
									children: item.value
								})]
							}, item.label))
						}),
						/* @__PURE__ */ jsx("div", {
							className: "mt-5 border-t border-slate-200 pt-4",
							children: /* @__PURE__ */ jsxs("div", {
								className: "flex items-center justify-between",
								children: [/* @__PURE__ */ jsx("span", {
									className: "text-sm font-medium text-slate-500",
									children: "Total due"
								}), /* @__PURE__ */ jsx("span", {
									className: "text-2xl font-bold text-slate-900",
									children: "₦6,000"
								})]
							})
						}),
						/* @__PURE__ */ jsx("button", {
							type: "button",
							className: "mt-6 w-full rounded-2xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-violet-200 transition hover:bg-violet-500",
							children: "Pay now"
						}),
						/* @__PURE__ */ jsx("button", {
							type: "button",
							className: "mt-3 w-full rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-700 transition hover:bg-violet-100",
							children: "Continue to delivery OTP"
						})
					]
				})]
			}),
			/* @__PURE__ */ jsxs("section", {
				className: "rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm shadow-slate-100 sm:p-5",
				children: [/* @__PURE__ */ jsx("h3", {
					className: "text-lg font-bold text-slate-900",
					children: "Pickup instructions"
				}), /* @__PURE__ */ jsx("p", {
					className: "mt-3 text-sm text-slate-600",
					children: "Please drop off the bag at the nearest pickup point. Keep whites separate and note any silk items before handover."
				})]
			})
		]
	});
});
//#endregion
//#region src/portals/customer/pages/OtpFlow.tsx
var OtpFlow_exports = /* @__PURE__ */ __exportAll({ default: () => OtpFlow_default });
var OtpFlow_default = UNSAFE_withComponentProps(function OtpFlow() {
	const { orders } = useCustomerStore();
	const [activeStep, setActiveStep] = useState(0);
	const order = orders[0];
	const otpSteps = [{
		label: "Pickup OTP",
		detail: "Share this when dropping off your bag",
		value: order?.pickedUp ? void 0 : order?.pickupOtp
	}, {
		label: "Delivery OTP",
		detail: "Use this to collect your clean clothes",
		value: order?.deliveryOtp
	}];
	const currentStep = otpSteps[activeStep];
	return /* @__PURE__ */ jsxs("div", {
		className: "space-y-5 pb-8",
		children: [
			/* @__PURE__ */ jsxs("header", {
				className: "flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between",
				children: [/* @__PURE__ */ jsx("div", { children: /* @__PURE__ */ jsx("h2", {
					className: "mt-1 text-2xl font-bold tracking-tight text-[#121212] lg:hidden",
					children: "Pickup and delivery OTP"
				}) }), /* @__PURE__ */ jsx("span", {
					className: "rounded-full bg-sky-50 px-3 py-1.5 text-sm font-medium text-sky-700",
					children: order?.id ?? "No active order"
				})]
			}),
			/* @__PURE__ */ jsxs("section", {
				className: "rounded-[28px] bg-gradient-to-br from-violet-600 via-violet-700 to-fuchsia-500 p-5 text-white shadow-lg shadow-violet-200 sm:p-6",
				children: [/* @__PURE__ */ jsxs("div", {
					className: "flex items-start justify-between gap-4",
					children: [/* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("p", {
						className: "text-xs font-medium uppercase tracking-[0.18em] text-violet-100",
						children: "Current code"
					}), /* @__PURE__ */ jsx("h3", {
						className: "mt-3 text-4xl font-bold tracking-[0.24em]",
						children: currentStep.value ?? "Not available"
					})] }), /* @__PURE__ */ jsx("button", {
						type: "button",
						disabled: !currentStep.value,
						onClick: () => currentStep.value && navigator.clipboard?.writeText(currentStep.value),
						className: "rounded-2xl bg-white/10 px-3 py-2 text-sm font-medium text-white backdrop-blur-sm disabled:cursor-not-allowed disabled:opacity-50",
						children: "Copy"
					})]
				}), /* @__PURE__ */ jsx("p", {
					className: "mt-4 text-sm text-violet-100",
					children: currentStep.detail
				})]
			}),
			/* @__PURE__ */ jsxs("section", {
				className: "rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm shadow-slate-100 sm:p-5",
				children: [/* @__PURE__ */ jsx("div", {
					className: "flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
					children: otpSteps.map((step, index) => /* @__PURE__ */ jsx("button", {
						type: "button",
						onClick: () => setActiveStep(index),
						className: `shrink-0 rounded-full px-4 py-2 text-sm font-medium transition ${index === activeStep ? "bg-violet-600 text-white shadow-sm shadow-violet-200" : "bg-slate-50 text-slate-500 hover:bg-violet-50 hover:text-violet-700"}`,
						children: step.label
					}, step.label))
				}), /* @__PURE__ */ jsxs("div", {
					className: "mt-5 rounded-[24px] bg-slate-50 p-4",
					children: [/* @__PURE__ */ jsxs("div", {
						className: "flex items-center justify-between gap-3",
						children: [/* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("p", {
							className: "text-[10px] uppercase tracking-[0.22em] text-slate-400",
							children: "Status"
						}), /* @__PURE__ */ jsx("p", {
							className: "mt-2 text-lg font-bold text-slate-900",
							children: currentStep.value ? "Ready for handoff" : "Waiting for the next step"
						})] }), /* @__PURE__ */ jsx("span", {
							className: `rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${currentStep.value ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`,
							children: currentStep.value ? "Active" : "Unavailable"
						})]
					}), /* @__PURE__ */ jsxs("div", {
						className: "mt-5 grid gap-3 sm:grid-cols-2",
						children: [/* @__PURE__ */ jsxs("div", {
							className: "rounded-2xl border border-slate-200 bg-white p-3",
							children: [/* @__PURE__ */ jsx("p", {
								className: "text-xs text-slate-500",
								children: "Bag count"
							}), /* @__PURE__ */ jsxs("p", {
								className: "mt-2 text-xl font-bold text-slate-900",
								children: [order?.items ?? 0, " clothes"]
							})]
						}), /* @__PURE__ */ jsxs("div", {
							className: "rounded-2xl border border-slate-200 bg-white p-3",
							children: [/* @__PURE__ */ jsx("p", {
								className: "text-xs text-slate-500",
								children: "Service"
							}), /* @__PURE__ */ jsx("p", {
								className: "mt-2 text-xl font-bold text-slate-900",
								children: order?.service ?? "No active order"
							})]
						})]
					})]
				})]
			}),
			/* @__PURE__ */ jsxs("section", {
				className: "grid gap-4 lg:grid-cols-2",
				children: [/* @__PURE__ */ jsxs("div", {
					className: "rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm shadow-slate-100 sm:p-5",
					children: [/* @__PURE__ */ jsx("h3", {
						className: "text-lg font-bold text-slate-900",
						children: "How it works"
					}), /* @__PURE__ */ jsxs("ol", {
						className: "mt-4 space-y-3 text-sm text-slate-600",
						children: [
							/* @__PURE__ */ jsx("li", { children: "1. Present the pickup OTP when dropping off your clothes." }),
							/* @__PURE__ */ jsx("li", { children: "2. Our team confirms the bag and marks it as received." }),
							/* @__PURE__ */ jsx("li", { children: "3. After payment, the delivery OTP is generated for collection." })
						]
					})]
				}), /* @__PURE__ */ jsxs("div", {
					className: "rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm shadow-slate-100 sm:p-5",
					children: [
						/* @__PURE__ */ jsx("h3", {
							className: "text-lg font-bold text-slate-900",
							children: "Need help?"
						}),
						/* @__PURE__ */ jsx("p", {
							className: "mt-3 text-sm text-slate-600",
							children: "If the code is not working, contact support or ask a staff member to verify the order manually."
						}),
						/* @__PURE__ */ jsx("button", {
							type: "button",
							className: "mt-5 rounded-full border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm font-semibold text-violet-700",
							children: "Contact support"
						})
					]
				})]
			})
		]
	});
});
//#endregion
//#region src/portals/customer/pages/Login.tsx
var Login_exports$3 = /* @__PURE__ */ __exportAll({ default: () => Login_default$3 });
var Login_default$3 = UNSAFE_withComponentProps(function Login() {
	useNavigate();
	const [email, setEmail] = useState("");
	const [phone, setPhone] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState("");
	const handleContinue = async (event) => {
		event?.preventDefault();
		setError("");
		if (!email.trim()) {
			setError("Enter your email address to continue.");
			return;
		}
		setError("Supabase is not configured. Add the required environment variables to continue.");
	};
	return /* @__PURE__ */ jsx("div", {
		className: "flex min-h-screen items-center justify-center overflow-hidden bg-[#0d1016] px-4 py-6 sm:px-6 lg:px-10",
		style: {
			backgroundImage: "linear-gradient(90deg, rgba(12,15,22,0.82) 0%, rgba(12,15,22,0.62) 32%, rgba(12,15,22,0.1) 100%), url(\"https://images.unsplash.com/photo-1567113463300-102a7eb3cb26?q=80&w=1470&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D\")",
			backgroundSize: "cover",
			backgroundPosition: "center"
		},
		children: /* @__PURE__ */ jsxs("div", {
			className: "w-full max-w-6xl items-center gap-12 lg:flex lg:justify-between",
			children: [/* @__PURE__ */ jsxs("div", {
				className: "hidden max-w-xl flex-1 pb-10 pt-10 text-white lg:block",
				children: [
					/* @__PURE__ */ jsx(QaffyLogo, {
						light: true,
						className: "inline-flex"
					}),
					/* @__PURE__ */ jsxs("h1", {
						className: "mt-8 text-5xl font-bold leading-[1.06] tracking-[-0.04em] text-white",
						children: ["Premium Care,", /* @__PURE__ */ jsx("span", {
							className: "block text-white/85",
							children: "Every Fabric."
						})]
					}),
					/* @__PURE__ */ jsx("p", {
						className: "mt-6 max-w-md text-base leading-7 text-slate-200",
						children: "Fresh Laundry, Zero Hassle"
					}),
					/* @__PURE__ */ jsx("p", {
						className: "mt-2 max-w-md text-base leading-7 text-slate-300",
						children: "Qaffy picks up, washes, and delivers — so you never have to worry about laundry again."
					})
				]
			}), /* @__PURE__ */ jsxs("div", {
				className: "w-full max-w-[430px] rounded-[36px] bg-white/95 p-5 shadow-[0_30px_80px_rgba(0,0,0,0.28)] backdrop-blur-sm sm:p-7",
				style: { fontFamily: "Qanelas, sans-serif" },
				children: [/* @__PURE__ */ jsxs("div", {
					className: "mb-7 text-center",
					children: [/* @__PURE__ */ jsx("h2", {
						className: "text-[2.7rem] leading-none text-slate-900",
						style: { fontFamily: "Freestyle Script, cursive" },
						children: "Customer Login"
					}), /* @__PURE__ */ jsx("p", {
						className: "mt-2 text-sm text-slate-500",
						children: "Use your email and phone number to continue"
					})]
				}), /* @__PURE__ */ jsxs("form", {
					onSubmit: handleContinue,
					children: [
						/* @__PURE__ */ jsxs("button", {
							type: "button",
							onClick: () => setError("Google sign-in will be connected after email OTP authentication."),
							className: "flex w-full items-center justify-center gap-3 rounded-2xl bg-violet-600 px-4 py-3.5 text-sm font-semibold text-white shadow-md shadow-violet-200 transition hover:bg-violet-700",
							children: [/* @__PURE__ */ jsxs("svg", {
								viewBox: "0 0 48 48",
								"aria-hidden": "true",
								className: "h-5 w-5",
								role: "img",
								children: [
									/* @__PURE__ */ jsx("path", {
										fill: "#EA4335",
										d: "M24 9.5c3.54 0 6.72 1.22 9.23 3.61l6.86-6.86C35.47 2.39 30.27 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.2C12.13 13.52 17.6 9.5 24 9.5Z"
									}),
									/* @__PURE__ */ jsx("path", {
										fill: "#4285F4",
										d: "M46.5 24.6c0-1.64-.15-3.22-.42-4.74H24v9h12.7c-.55 2.96-2.2 5.47-4.69 7.17l7.6 5.9c4.43-4.09 7.89-10.15 7.89-17.33Z"
									}),
									/* @__PURE__ */ jsx("path", {
										fill: "#FBBC05",
										d: "M32.01 36.11c-1.99 1.35-4.54 2.14-8.01 2.14-6.4 0-11.87-4.02-13.81-9.42l-8.02 6.21C3.99 41.38 13.14 48 24 48c7.1 0 13.08-2.34 17.42-6.36l-9.41-5.53Z"
									}),
									/* @__PURE__ */ jsx("path", {
										fill: "#34A853",
										d: "M10.2 28.83A14.42 14.42 0 0 1 9.5 24c0-1.63.28-3.22.78-4.74L2.56 13.22A23.92 23.92 0 0 0 0 24c0 3.78.89 7.35 2.56 10.49l7.64-5.66Z"
									})
								]
							}), "Continue with Google"]
						}),
						/* @__PURE__ */ jsxs("div", {
							className: "space-y-4 pt-4",
							children: [/* @__PURE__ */ jsx("label", {
								className: "block",
								children: /* @__PURE__ */ jsx("input", {
									type: "email",
									"aria-label": "Email address",
									value: email,
									onChange: (event) => setEmail(event.target.value),
									placeholder: "Enter your email",
									className: "h-14 w-full rounded-lg border border-[#f24d4d] bg-white px-4 text-[14px] font-semibold text-black shadow-sm outline-none transition placeholder:text-[#8e9a9a] focus:border-[#2563eb] focus:ring-2 focus:ring-blue-100"
								})
							}), /* @__PURE__ */ jsx("label", {
								className: "block",
								children: /* @__PURE__ */ jsx("input", {
									type: "tel",
									"aria-label": "Phone number",
									value: phone,
									onChange: (event) => setPhone(event.target.value),
									placeholder: "0803 123 4567",
									className: "h-14 w-full rounded-lg border border-[#f24d4d] bg-white px-4 text-[14px] font-semibold text-black shadow-sm outline-none transition placeholder:text-[#8e9a9a] focus:border-[#2563eb] focus:ring-2 focus:ring-blue-100"
								})
							})]
						}),
						error && /* @__PURE__ */ jsx("p", {
							role: "alert",
							className: "mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700",
							children: error
						}),
						/* @__PURE__ */ jsxs("div", {
							className: "mt-5 flex items-center justify-between gap-2 text-sm text-slate-500",
							children: [/* @__PURE__ */ jsxs("label", {
								className: "inline-flex items-center gap-2",
								children: [/* @__PURE__ */ jsx("input", {
									type: "checkbox",
									className: "h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
								}), "Stay signed in"]
							}), /* @__PURE__ */ jsx("button", {
								type: "button",
								className: "font-medium text-violet-600 hover:text-violet-700",
								children: "Forgot password?"
							})]
						}),
						/* @__PURE__ */ jsx("button", {
							type: "submit",
							disabled: isSubmitting,
							className: "mt-6 w-full rounded-2xl bg-slate-900 px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-slate-800",
							children: isSubmitting ? "Sending code..." : "Sign in"
						}),
						/* @__PURE__ */ jsxs("p", {
							className: "mt-6 text-center text-sm text-slate-500",
							children: [
								"New to Qaffy?",
								" ",
								/* @__PURE__ */ jsx(Link, {
									to: "/create-account",
									className: "font-semibold text-violet-600 hover:text-violet-700",
									children: "Create account"
								})
							]
						})
					]
				})]
			})]
		})
	});
});
//#endregion
//#region src/portals/customer/pages/CreateAccount.tsx
var CreateAccount_exports = /* @__PURE__ */ __exportAll({ default: () => CreateAccount_default });
var CreateAccount_default = UNSAFE_withComponentProps(function CreateAccount() {
	useNavigate();
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [phone, setPhone] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState("");
	const handleContinue = async (event) => {
		event?.preventDefault();
		setError("");
		if (!name.trim() || !email.trim() || !phone.trim()) {
			setError("Enter your name, email, and phone number to continue.");
			return;
		}
		setError("Supabase is not configured. Add the required environment variables to continue.");
	};
	return /* @__PURE__ */ jsx("div", {
		className: "flex min-h-screen items-center justify-center overflow-hidden bg-[#0d1016] px-4 py-6 sm:px-6 lg:px-10",
		style: {
			backgroundImage: "linear-gradient(90deg, rgba(12,15,22,0.82) 0%, rgba(12,15,22,0.62) 32%, rgba(12,15,22,0.1) 100%), url(\"https://images.unsplash.com/photo-1567113463300-102a7eb3cb26?q=80&w=1470&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D\")",
			backgroundSize: "cover",
			backgroundPosition: "center"
		},
		children: /* @__PURE__ */ jsxs("div", {
			className: "w-full max-w-6xl items-center gap-12 lg:flex lg:justify-between",
			children: [/* @__PURE__ */ jsxs("div", {
				className: "hidden max-w-xl flex-1 pb-10 pt-10 text-white lg:block",
				children: [
					/* @__PURE__ */ jsx(QaffyLogo, {
						light: true,
						className: "inline-flex"
					}),
					/* @__PURE__ */ jsxs("h1", {
						className: "mt-8 text-5xl font-bold leading-[1.06] tracking-[-0.04em] text-white",
						children: ["Premium Care,", /* @__PURE__ */ jsx("span", {
							className: "block text-white/85",
							children: "Every Fabric."
						})]
					}),
					/* @__PURE__ */ jsx("p", {
						className: "mt-6 max-w-md text-base leading-7 text-slate-200",
						children: "Fresh Laundry, Zero Hassle"
					}),
					/* @__PURE__ */ jsx("p", {
						className: "mt-2 max-w-md text-base leading-7 text-slate-300",
						children: "Qaffy picks up, washes, and delivers — so you never have to worry about laundry again."
					})
				]
			}), /* @__PURE__ */ jsxs("div", {
				className: "w-full max-w-[430px] rounded-[36px] bg-white/95 p-5 shadow-[0_30px_80px_rgba(0,0,0,0.28)] backdrop-blur-sm sm:p-7",
				style: { fontFamily: "Qanelas, sans-serif" },
				children: [/* @__PURE__ */ jsxs("div", {
					className: "mb-7 text-center",
					children: [/* @__PURE__ */ jsx("h2", {
						className: "text-[2.7rem] leading-none text-slate-900",
						style: { fontFamily: "Freestyle Script, cursive" },
						children: "Create account"
					}), /* @__PURE__ */ jsx("p", {
						className: "mt-2 text-sm text-slate-500",
						children: "Start with your email and phone number"
					})]
				}), /* @__PURE__ */ jsxs("form", {
					onSubmit: handleContinue,
					children: [
						/* @__PURE__ */ jsxs("button", {
							type: "button",
							onClick: () => setError("Google sign-in will be connected after email OTP authentication."),
							className: "flex w-full items-center justify-center gap-3 rounded-2xl bg-violet-600 px-4 py-3.5 text-sm font-semibold text-white shadow-md shadow-violet-200 transition hover:bg-violet-700",
							children: [/* @__PURE__ */ jsxs("svg", {
								viewBox: "0 0 48 48",
								"aria-hidden": "true",
								className: "h-5 w-5",
								role: "img",
								children: [
									/* @__PURE__ */ jsx("path", {
										fill: "#EA4335",
										d: "M24 9.5c3.54 0 6.72 1.22 9.23 3.61l6.86-6.86C35.47 2.39 30.27 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.2C12.13 13.52 17.6 9.5 24 9.5Z"
									}),
									/* @__PURE__ */ jsx("path", {
										fill: "#4285F4",
										d: "M46.5 24.6c0-1.64-.15-3.22-.42-4.74H24v9h12.7c-.55 2.96-2.2 5.47-4.69 7.17l7.6 5.9c4.43-4.09 7.89-10.15 7.89-17.33Z"
									}),
									/* @__PURE__ */ jsx("path", {
										fill: "#FBBC05",
										d: "M32.01 36.11c-1.99 1.35-4.54 2.14-8.01 2.14-6.4 0-11.87-4.02-13.81-9.42l-8.02 6.21C3.99 41.38 13.14 48 24 48c7.1 0 13.08-2.34 17.42-6.36l-9.41-5.53Z"
									}),
									/* @__PURE__ */ jsx("path", {
										fill: "#34A853",
										d: "M10.2 28.83A14.42 14.42 0 0 1 9.5 24c0-1.63.28-3.22.78-4.74L2.56 13.22A23.92 23.92 0 0 0 0 24c0 3.78.89 7.35 2.56 10.49l7.64-5.66Z"
									})
								]
							}), "Continue with Google"]
						}),
						/* @__PURE__ */ jsxs("div", {
							className: "space-y-4 pt-4",
							children: [
								/* @__PURE__ */ jsx("label", {
									className: "block",
									children: /* @__PURE__ */ jsx("input", {
										type: "text",
										"aria-label": "Full name",
										value: name,
										onChange: (event) => setName(event.target.value),
										placeholder: "Enter your full name",
										className: "h-14 w-full rounded-lg border border-[#f24d4d] bg-white px-4 text-[14px] font-semibold text-black shadow-sm outline-none transition placeholder:text-[#8e9a9a] focus:border-[#2563eb] focus:ring-2 focus:ring-blue-100"
									})
								}),
								/* @__PURE__ */ jsx("label", {
									className: "block",
									children: /* @__PURE__ */ jsx("input", {
										type: "email",
										"aria-label": "Email address",
										value: email,
										onChange: (event) => setEmail(event.target.value),
										placeholder: "Enter your email",
										className: "h-14 w-full rounded-lg border border-[#f24d4d] bg-white px-4 text-[14px] font-semibold text-black shadow-sm outline-none transition placeholder:text-[#8e9a9a] focus:border-[#2563eb] focus:ring-2 focus:ring-blue-100"
									})
								}),
								/* @__PURE__ */ jsx("label", {
									className: "block",
									children: /* @__PURE__ */ jsx("input", {
										type: "tel",
										"aria-label": "Phone number",
										value: phone,
										onChange: (event) => setPhone(event.target.value),
										placeholder: "0803 123 4567",
										className: "h-14 w-full rounded-lg border border-[#f24d4d] bg-white px-4 text-[14px] font-semibold text-black shadow-sm outline-none transition placeholder:text-[#8e9a9a] focus:border-[#2563eb] focus:ring-2 focus:ring-blue-100"
									})
								})
							]
						}),
						error && /* @__PURE__ */ jsx("p", {
							role: "alert",
							className: "mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700",
							children: error
						}),
						/* @__PURE__ */ jsx("div", {
							className: "mt-5 flex items-center justify-between gap-2 text-sm text-slate-500",
							children: /* @__PURE__ */ jsxs("label", {
								className: "inline-flex items-center gap-2",
								children: [/* @__PURE__ */ jsx("input", {
									type: "checkbox",
									className: "h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
								}), "I agree to the terms"]
							})
						}),
						/* @__PURE__ */ jsx("button", {
							type: "submit",
							disabled: isSubmitting,
							className: "mt-6 w-full rounded-2xl bg-slate-900 px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-slate-800",
							children: isSubmitting ? "Sending code..." : "Create account"
						}),
						/* @__PURE__ */ jsxs("p", {
							className: "mt-6 text-center text-sm text-slate-500",
							children: [
								"Already have an account?",
								" ",
								/* @__PURE__ */ jsx(Link, {
									to: "/login",
									className: "font-semibold text-violet-600 hover:text-violet-700",
									children: "Sign in"
								})
							]
						})
					]
				})]
			})]
		})
	});
});
//#endregion
//#region src/portals/customer/pages/VerifyOtp.tsx
var VerifyOtp_exports = /* @__PURE__ */ __exportAll({ default: () => VerifyOtp_default });
var VerifyOtp_default = UNSAFE_withComponentProps(function VerifyOtp() {
	const navigate = useNavigate();
	const location = useLocation();
	const params = new URLSearchParams(location.search);
	const email = params.get("email") ?? "";
	const mode = params.get("mode") ?? "login";
	const [code, setCode] = useState([
		"",
		"",
		"",
		"",
		"",
		""
	]);
	const [secondsRemaining, setSecondsRemaining] = useState(30);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState("");
	const handleVerify = async () => {
		setError("");
		if (!email) {
			setError("This verification link is missing the email address. Start again from login.");
			return;
		}
		if (code.join("").length !== 6) return;
		setError("Supabase is not configured. Add the required environment variables to continue.");
	};
	useEffect(() => {
		if (secondsRemaining === 0) return;
		const timer = window.setInterval(() => {
			setSecondsRemaining((seconds) => Math.max(seconds - 1, 0));
		}, 1e3);
		return () => window.clearInterval(timer);
	}, [secondsRemaining]);
	const updateCode = (index, value) => {
		const sanitized = value.replace(/\D/g, "").slice(0, 1);
		const next = [...code];
		next[index] = sanitized;
		setCode(next);
		if (sanitized && index < code.length - 1) document.getElementById(`otp-${index + 1}`)?.focus();
	};
	const isComplete = code.join("").length === 6;
	const canResend = secondsRemaining === 0;
	const handleResend = async () => {};
	return /* @__PURE__ */ jsx("div", {
		className: "flex min-h-screen items-center justify-center overflow-hidden bg-[#0d1016] px-4 py-6 sm:px-6 lg:px-10",
		style: {
			backgroundImage: "linear-gradient(90deg, rgba(12,15,22,0.82) 0%, rgba(12,15,22,0.62) 32%, rgba(12,15,22,0.1) 100%), url(\"https://images.unsplash.com/photo-1567113463300-102a7eb3cb26?q=80&w=1470&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D\")",
			backgroundSize: "cover",
			backgroundPosition: "center"
		},
		children: /* @__PURE__ */ jsxs("div", {
			className: "w-full max-w-6xl items-center gap-12 lg:flex lg:justify-between",
			children: [/* @__PURE__ */ jsxs("div", {
				className: "hidden max-w-xl flex-1 pb-10 pt-10 text-white lg:block",
				children: [
					/* @__PURE__ */ jsx(QaffyLogo, {
						light: true,
						className: "inline-flex"
					}),
					/* @__PURE__ */ jsxs("h1", {
						className: "mt-8 text-5xl font-bold leading-[1.06] tracking-[-0.04em] text-white",
						children: ["Premium Care,", /* @__PURE__ */ jsx("span", {
							className: "block text-white/85",
							children: "Every Fabric."
						})]
					}),
					/* @__PURE__ */ jsx("p", {
						className: "mt-6 max-w-md text-base leading-7 text-slate-200",
						children: "Fresh Laundry, Zero Hassle"
					}),
					/* @__PURE__ */ jsx("p", {
						className: "mt-2 max-w-md text-base leading-7 text-slate-300",
						children: "Qaffy picks up, washes, and delivers — so you never have to worry about laundry again."
					})
				]
			}), /* @__PURE__ */ jsxs("div", {
				className: "w-full max-w-[520px] rounded-[20px] bg-white p-5 shadow-[0_30px_80px_rgba(0,0,0,0.28)] backdrop-blur-sm sm:p-7",
				children: [/* @__PURE__ */ jsxs("button", {
					type: "button",
					onClick: () => navigate(mode === "create-account" ? "/create-account" : "/login"),
					className: "mb-6 inline-flex items-center gap-3 text-base font-semibold text-[#3d3d3d] transition hover:text-slate-700",
					children: [/* @__PURE__ */ jsx("span", {
						className: "text-lg",
						children: "←"
					}), /* @__PURE__ */ jsx("span", { children: "Back to login" })]
				}), /* @__PURE__ */ jsxs("div", {
					className: "space-y-5",
					children: [
						/* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("h2", {
							className: "text-[2.2rem] font-bold tracking-[-0.04em] text-slate-900",
							children: "Enter OTP"
						}), /* @__PURE__ */ jsxs("p", {
							className: "mt-2 text-base text-[#8e9a9a]",
							children: ["Please provide the OTP sent to ", /* @__PURE__ */ jsx("span", {
								className: "font-semibold text-slate-700",
								children: email
							})]
						})] }),
						error && /* @__PURE__ */ jsx("p", {
							role: "alert",
							className: "rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700",
							children: error
						}),
						/* @__PURE__ */ jsx("div", {
							className: "flex items-center justify-center gap-3 pt-3",
							children: code.map((digit, index) => /* @__PURE__ */ jsx("input", {
								id: `otp-${index}`,
								type: "text",
								inputMode: "numeric",
								maxLength: 1,
								value: digit,
								onChange: (event) => updateCode(index, event.target.value),
								className: "h-[80px] w-[72px] rounded-lg border border-[#f24d4d] bg-white text-center text-[1.5rem] font-semibold text-black shadow-sm outline-none transition focus:border-[#2563eb] focus:ring-2 focus:ring-blue-100"
							}, index))
						}),
						/* @__PURE__ */ jsxs("p", {
							className: "text-center text-sm text-[#3d3d3d]",
							children: [
								"Didn't get the code?",
								" ",
								/* @__PURE__ */ jsx("button", {
									type: "button",
									onClick: handleResend,
									disabled: !canResend,
									className: `font-semibold transition ${canResend ? "cursor-pointer text-[#2563eb] hover:text-blue-700" : "cursor-default text-slate-500"}`,
									children: canResend ? "Resend code" : `Resend in ${secondsRemaining} secs`
								})
							]
						}),
						/* @__PURE__ */ jsx("button", {
							type: "button",
							onClick: handleVerify,
							className: `mt-2 flex w-full items-center justify-center rounded-full px-4 py-3 text-[1.05rem] font-semibold transition ${isComplete ? "bg-[#2563eb] text-white hover:bg-blue-700" : "cursor-not-allowed bg-[#dfe2e2] text-[#8e9a9a]"}`,
							disabled: !isComplete || isSubmitting,
							children: isSubmitting ? "Verifying..." : "Proceed"
						})
					]
				})]
			})]
		})
	});
});
//#endregion
//#region src/portals/logistics/LogisticsLayout.tsx
var LogisticsLayout_exports = /* @__PURE__ */ __exportAll({ default: () => LogisticsLayout_default });
var LogisticsLayout_default = UNSAFE_withComponentProps(function LogisticsLayout() {
	return /* @__PURE__ */ jsxs("div", {
		className: "min-h-screen bg-transparent text-slate-900",
		children: [/* @__PURE__ */ jsx("header", {
			className: "sticky top-0 z-10 border-b border-slate-200 bg-white/80 backdrop-blur-xl",
			children: /* @__PURE__ */ jsxs("div", {
				className: "mx-auto flex max-w-5xl items-center justify-between px-4 py-3.5",
				children: [/* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("p", {
					className: "text-[10px] font-semibold uppercase tracking-[0.22em] text-violet-500",
					children: "Operations"
				}), /* @__PURE__ */ jsx("h1", {
					className: "text-xl font-bold text-slate-900",
					children: "Qaffy Logistics"
				})] }), /* @__PURE__ */ jsx("div", {
					className: "rounded-full border border-violet-100 bg-violet-50 p-1",
					children: /* @__PURE__ */ jsxs("div", {
						className: "flex gap-1",
						children: [/* @__PURE__ */ jsx(NavLink, {
							to: "/logistics",
							end: true,
							className: ({ isActive }) => `rounded-full px-3 py-1.5 text-sm font-medium transition ${isActive ? "bg-violet-600 text-white shadow-sm" : "text-slate-600"}`,
							children: "Pickup"
						}), /* @__PURE__ */ jsx(NavLink, {
							to: "/logistics/delivery",
							className: ({ isActive }) => `rounded-full px-3 py-1.5 text-sm font-medium transition ${isActive ? "bg-violet-600 text-white shadow-sm" : "text-slate-600"}`,
							children: "Delivery"
						})]
					})
				})]
			})
		}), /* @__PURE__ */ jsx("main", {
			className: "mx-auto max-w-5xl p-4 md:p-6",
			children: /* @__PURE__ */ jsx(Outlet, {})
		})]
	});
});
//#endregion
//#region src/portals/logistics/pages/Home.tsx
var Home_exports$2 = /* @__PURE__ */ __exportAll({ default: () => Home_default$2 });
var stats$1 = [{
	label: "Picked up",
	value: "18",
	accent: "bg-violet-100 text-violet-700"
}, {
	label: "Delivered",
	value: "12",
	accent: "bg-emerald-100 text-emerald-700"
}];
var Home_default$2 = UNSAFE_withComponentProps(function Home() {
	return /* @__PURE__ */ jsxs("div", {
		className: "space-y-5",
		children: [/* @__PURE__ */ jsx("div", {
			className: "grid gap-3 md:grid-cols-2",
			children: stats$1.map((item) => /* @__PURE__ */ jsxs("div", {
				className: "rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm shadow-slate-100",
				children: [/* @__PURE__ */ jsx("div", {
					className: `inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${item.accent}`,
					children: item.label
				}), /* @__PURE__ */ jsx("p", {
					className: "mt-4 text-3xl font-bold text-slate-900",
					children: item.value
				})]
			}, item.label))
		}), /* @__PURE__ */ jsxs("div", {
			className: "rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm shadow-slate-100 md:p-5",
			children: [
				/* @__PURE__ */ jsxs("div", {
					className: "mb-3 flex items-center justify-between",
					children: [/* @__PURE__ */ jsx("h2", {
						className: "text-xl font-bold text-slate-900",
						children: "Search OTP"
					}), /* @__PURE__ */ jsx("span", {
						className: "rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700",
						children: "Pickup"
					})]
				}),
				/* @__PURE__ */ jsxs("label", {
					className: "block",
					children: [/* @__PURE__ */ jsx("span", {
						className: "mb-1.5 block text-sm font-medium text-slate-600",
						children: "Customer OTP"
					}), /* @__PURE__ */ jsx("input", {
						type: "text",
						placeholder: "Enter OTP",
						className: "w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-base text-slate-900 placeholder:text-slate-400"
					})]
				}),
				/* @__PURE__ */ jsxs("div", {
					className: "mt-4 rounded-[22px] bg-slate-50 p-4",
					children: [
						/* @__PURE__ */ jsx("p", {
							className: "text-xs uppercase tracking-[0.18em] text-slate-400",
							children: "Customer"
						}),
						/* @__PURE__ */ jsx("p", {
							className: "mt-2 text-lg font-bold text-slate-900",
							children: "Aisha Bello"
						}),
						/* @__PURE__ */ jsx("p", {
							className: "mt-1 text-sm text-slate-500",
							children: "3 bags • 2 orders"
						})
					]
				}),
				/* @__PURE__ */ jsx("button", {
					type: "button",
					className: "mt-4 w-full rounded-2xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-violet-200",
					children: "Confirm pickup"
				})
			]
		})]
	});
});
//#endregion
//#region src/portals/logistics/pages/Delivery.tsx
var Delivery_exports = /* @__PURE__ */ __exportAll({ default: () => Delivery_default });
var stats = [{
	label: "Collected today",
	value: "18",
	accent: "bg-violet-100 text-violet-700"
}, {
	label: "Delivered",
	value: "12",
	accent: "bg-emerald-100 text-emerald-700"
}];
var Delivery_default = UNSAFE_withComponentProps(function Delivery() {
	return /* @__PURE__ */ jsxs("div", {
		className: "space-y-5",
		children: [/* @__PURE__ */ jsx("div", {
			className: "grid gap-3 md:grid-cols-2",
			children: stats.map((item) => /* @__PURE__ */ jsxs("div", {
				className: "rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm shadow-slate-100",
				children: [/* @__PURE__ */ jsx("div", {
					className: `inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${item.accent}`,
					children: item.label
				}), /* @__PURE__ */ jsx("p", {
					className: "mt-4 text-3xl font-bold text-slate-900",
					children: item.value
				})]
			}, item.label))
		}), /* @__PURE__ */ jsxs("div", {
			className: "rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm shadow-slate-100 md:p-5",
			children: [
				/* @__PURE__ */ jsxs("div", {
					className: "mb-3 flex items-center justify-between",
					children: [/* @__PURE__ */ jsx("h2", {
						className: "text-xl font-bold text-slate-900",
						children: "Search OTP"
					}), /* @__PURE__ */ jsx("span", {
						className: "rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700",
						children: "Delivery"
					})]
				}),
				/* @__PURE__ */ jsxs("label", {
					className: "block",
					children: [/* @__PURE__ */ jsx("span", {
						className: "mb-1.5 block text-sm font-medium text-slate-600",
						children: "Customer OTP"
					}), /* @__PURE__ */ jsx("input", {
						type: "text",
						placeholder: "Enter OTP",
						className: "w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
					})]
				}),
				/* @__PURE__ */ jsxs("div", {
					className: "mt-4 rounded-[22px] bg-slate-50 p-4",
					children: [
						/* @__PURE__ */ jsx("p", {
							className: "text-xs uppercase tracking-[0.18em] text-slate-400",
							children: "Customer"
						}),
						/* @__PURE__ */ jsx("p", {
							className: "mt-2 text-lg font-bold text-slate-900",
							children: "Aisha Bello"
						}),
						/* @__PURE__ */ jsx("p", {
							className: "mt-1 text-sm text-slate-500",
							children: "3 bags • Paid • Ready for collection"
						})
					]
				}),
				/* @__PURE__ */ jsx("button", {
					type: "button",
					className: "mt-4 w-full rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-emerald-200",
					children: "Confirm delivery"
				})
			]
		})]
	});
});
//#endregion
//#region src/portals/logistics/pages/Login.tsx
var Login_exports$2 = /* @__PURE__ */ __exportAll({ default: () => Login_default$2 });
var Login_default$2 = UNSAFE_withComponentProps(function Login() {
	return /* @__PURE__ */ jsxs("div", {
		className: "flex min-h-screen flex-col items-center justify-center gap-4",
		children: [
			/* @__PURE__ */ jsx("h1", {
				className: "text-xl font-semibold text-gray-900",
				children: "Logistics sign in"
			}),
			/* @__PURE__ */ jsx("input", {
				type: "email",
				placeholder: "you@example.com",
				className: "w-full max-w-sm rounded-md border border-gray-300 px-3 py-2 text-sm"
			}),
			/* @__PURE__ */ jsx("button", {
				type: "button",
				className: "rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark",
				children: "Send magic link"
			})
		]
	});
});
//#endregion
//#region src/portals/vendor/VendorLayout.tsx
var VendorLayout_exports = /* @__PURE__ */ __exportAll({ default: () => VendorLayout_default });
var VendorLayout_default = UNSAFE_withComponentProps(function VendorLayout() {
	return /* @__PURE__ */ jsxs("div", {
		className: "min-h-screen bg-transparent text-slate-900",
		children: [/* @__PURE__ */ jsx("header", {
			className: "sticky top-0 z-10 border-b border-violet-100 bg-white/80 backdrop-blur-xl",
			children: /* @__PURE__ */ jsxs("div", {
				className: "mx-auto flex max-w-5xl items-center justify-between px-4 py-3.5",
				children: [/* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("p", {
					className: "text-[10px] font-semibold uppercase tracking-[0.22em] text-violet-500",
					children: "Vendor portal"
				}), /* @__PURE__ */ jsx("h1", {
					className: "text-xl font-bold text-slate-900",
					children: "Qaffy Vendor"
				})] }), /* @__PURE__ */ jsx("button", {
					type: "button",
					className: "rounded-full bg-slate-900 px-3 py-1.5 text-sm font-medium text-white shadow-sm",
					children: "Today"
				})]
			})
		}), /* @__PURE__ */ jsx("main", {
			className: "mx-auto max-w-5xl p-4 md:p-6",
			children: /* @__PURE__ */ jsx(Outlet, {})
		})]
	});
});
//#endregion
//#region src/portals/vendor/pages/Home.tsx
var Home_exports$1 = /* @__PURE__ */ __exportAll({ default: () => Home_default$1 });
var itemRates = [
	{
		name: "Shirt",
		rate: "₦140"
	},
	{
		name: "Trouser",
		rate: "₦220"
	},
	{
		name: "Dress",
		rate: "₦320"
	},
	{
		name: "Jacket",
		rate: "₦400"
	}
];
var Home_default$1 = UNSAFE_withComponentProps(function Home() {
	return /* @__PURE__ */ jsxs("div", {
		className: "space-y-5",
		children: [/* @__PURE__ */ jsxs("section", {
			className: "rounded-[28px] bg-gradient-to-br from-violet-100 via-white to-fuchsia-50 p-5 shadow-sm shadow-violet-100",
			children: [/* @__PURE__ */ jsx("p", {
				className: "text-xs uppercase tracking-[0.18em] text-violet-600",
				children: "Amount due today"
			}), /* @__PURE__ */ jsx("h2", {
				className: "mt-3 text-4xl font-bold text-slate-900",
				children: "₦18,640"
			})]
		}), /* @__PURE__ */ jsxs("section", {
			className: "rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm shadow-slate-100 md:p-5",
			children: [
				/* @__PURE__ */ jsxs("div", {
					className: "mb-4 flex items-center justify-between",
					children: [/* @__PURE__ */ jsx("h2", {
						className: "text-xl font-bold text-slate-900",
						children: "Received items"
					}), /* @__PURE__ */ jsx("span", {
						className: "rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700",
						children: "Check mismatch"
					})]
				}),
				/* @__PURE__ */ jsx("div", {
					className: "space-y-3",
					children: itemRates.map((item) => /* @__PURE__ */ jsxs("div", {
						className: "flex items-center justify-between rounded-2xl bg-slate-50 p-3",
						children: [/* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("p", {
							className: "font-semibold text-slate-900",
							children: item.name
						}), /* @__PURE__ */ jsxs("p", {
							className: "text-xs text-slate-500",
							children: ["Rate: ", item.rate]
						})] }), /* @__PURE__ */ jsx("input", {
							type: "number",
							defaultValue: 0,
							className: "w-20 rounded-xl border border-slate-200 bg-white px-2 py-2 text-right text-base font-medium text-slate-900"
						})]
					}, item.name))
				}),
				/* @__PURE__ */ jsxs("div", {
					className: "mt-4 rounded-[22px] border border-amber-200 bg-amber-50 p-3",
					children: [/* @__PURE__ */ jsx("p", {
						className: "font-semibold text-amber-800",
						children: "Mismatch notice"
					}), /* @__PURE__ */ jsx("p", {
						className: "mt-1 text-sm text-amber-700",
						children: "Customer reported 1 red shirt and 2 polos. Verify and add notes for any variance."
					})]
				}),
				/* @__PURE__ */ jsx("button", {
					type: "button",
					className: "mt-4 w-full rounded-2xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-violet-200",
					children: "Submit pickup summary"
				})
			]
		})]
	});
});
//#endregion
//#region src/portals/vendor/pages/Login.tsx
var Login_exports$1 = /* @__PURE__ */ __exportAll({ default: () => Login_default$1 });
var Login_default$1 = UNSAFE_withComponentProps(function Login() {
	return /* @__PURE__ */ jsxs("div", {
		className: "flex min-h-screen flex-col items-center justify-center gap-4",
		children: [
			/* @__PURE__ */ jsx("h1", {
				className: "text-xl font-semibold text-gray-900",
				children: "Vendor sign in"
			}),
			/* @__PURE__ */ jsx("input", {
				type: "email",
				placeholder: "you@example.com",
				className: "w-full max-w-sm rounded-md border border-gray-300 px-3 py-2 text-sm"
			}),
			/* @__PURE__ */ jsx("button", {
				type: "button",
				className: "rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark",
				children: "Send magic link"
			})
		]
	});
});
//#endregion
//#region src/portals/admin/AdminLayout.tsx
var AdminLayout_exports = /* @__PURE__ */ __exportAll({ default: () => AdminLayout_default });
var navItems = [
	{
		to: "/",
		label: "Overview",
		end: true
	},
	{
		to: "/categories",
		label: "Categories"
	},
	{
		to: "/vendors",
		label: "Vendors"
	},
	{
		to: "/orders",
		label: "Orders"
	},
	{
		to: "/settings",
		label: "Settings"
	},
	{
		to: "/users",
		label: "Users"
	},
	{
		to: "/plans",
		label: "Plans"
	}
];
var AdminLayout_default = UNSAFE_withComponentProps(function AdminLayout() {
	return /* @__PURE__ */ jsxs("div", {
		className: "flex min-h-screen bg-transparent text-slate-900",
		children: [/* @__PURE__ */ jsxs("aside", {
			className: "hidden w-64 shrink-0 border-r border-violet-100 bg-white/80 p-5 backdrop-blur-xl md:block",
			children: [/* @__PURE__ */ jsxs("div", {
				className: "mb-8",
				children: [/* @__PURE__ */ jsx("p", {
					className: "text-[10px] font-semibold uppercase tracking-[0.22em] text-violet-500",
					children: "Admin"
				}), /* @__PURE__ */ jsx("h1", {
					className: "mt-2 text-2xl font-bold text-slate-900",
					children: "Qaffy"
				})]
			}), /* @__PURE__ */ jsx("nav", {
				className: "space-y-1.5",
				children: navItems.map((item) => /* @__PURE__ */ jsx(NavLink, {
					to: item.to,
					end: item.end,
					className: ({ isActive }) => `flex items-center rounded-2xl px-3 py-2.5 text-sm font-medium transition ${isActive ? "bg-violet-600 text-white shadow-md shadow-violet-200" : "text-slate-600 hover:bg-violet-50 hover:text-violet-700"}`,
					children: item.label
				}, item.to))
			})]
		}), /* @__PURE__ */ jsx("main", {
			className: "flex-1 p-4 md:p-8",
			children: /* @__PURE__ */ jsx("div", {
				className: "mx-auto max-w-6xl",
				children: /* @__PURE__ */ jsx(Outlet, {})
			})
		})]
	});
});
//#endregion
//#region src/portals/admin/pages/Home.tsx
var Home_exports = /* @__PURE__ */ __exportAll({ default: () => Home_default });
var metrics = [
	{
		label: "Total orders",
		value: "1,284"
	},
	{
		label: "Revenue",
		value: "₦2.6M"
	},
	{
		label: "Customers",
		value: "842"
	},
	{
		label: "Vendors",
		value: "36"
	}
];
var Home_default = UNSAFE_withComponentProps(function Home() {
	return /* @__PURE__ */ jsxs("div", {
		className: "space-y-5",
		children: [/* @__PURE__ */ jsx("div", {
			className: "grid gap-3 md:grid-cols-2 xl:grid-cols-4",
			children: metrics.map((item) => /* @__PURE__ */ jsxs("div", {
				className: "rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm shadow-slate-100",
				children: [/* @__PURE__ */ jsx("p", {
					className: "text-[10px] uppercase tracking-[0.2em] text-slate-400",
					children: item.label
				}), /* @__PURE__ */ jsx("p", {
					className: "mt-3 text-3xl font-bold text-slate-900",
					children: item.value
				})]
			}, item.label))
		}), /* @__PURE__ */ jsxs("section", {
			className: "rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm shadow-slate-100 md:p-5",
			children: [/* @__PURE__ */ jsxs("div", {
				className: "mb-4 flex items-center justify-between",
				children: [/* @__PURE__ */ jsx("h2", {
					className: "text-xl font-bold text-slate-900",
					children: "Plan performance"
				}), /* @__PURE__ */ jsx("button", {
					type: "button",
					className: "rounded-xl bg-violet-600 px-3 py-2 text-sm font-semibold text-white",
					children: "New plan"
				})]
			}), /* @__PURE__ */ jsx("div", {
				className: "space-y-3",
				children: [
					"Weekly plan",
					"Monthly plan",
					"Semester plan"
				].map((plan) => /* @__PURE__ */ jsxs("div", {
					className: "flex items-center justify-between rounded-2xl bg-slate-50 p-3",
					children: [/* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("p", {
						className: "font-semibold text-slate-900",
						children: plan
					}), /* @__PURE__ */ jsx("p", {
						className: "text-sm text-slate-500",
						children: "320 active users"
					})] }), /* @__PURE__ */ jsx("span", {
						className: "rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-medium text-emerald-700",
						children: "Active"
					})]
				}, plan))
			})]
		})]
	});
});
//#endregion
//#region src/portals/admin/pages/Login.tsx
var Login_exports = /* @__PURE__ */ __exportAll({ default: () => Login_default });
var Login_default = UNSAFE_withComponentProps(function Login() {
	return /* @__PURE__ */ jsxs("div", {
		className: "flex min-h-screen flex-col items-center justify-center gap-4",
		children: [
			/* @__PURE__ */ jsx("h1", {
				className: "text-xl font-semibold text-gray-900",
				children: "Admin sign in"
			}),
			/* @__PURE__ */ jsx("input", {
				type: "email",
				placeholder: "you@example.com",
				className: "w-full max-w-sm rounded-md border border-gray-300 px-3 py-2 text-sm"
			}),
			/* @__PURE__ */ jsx("button", {
				type: "button",
				className: "rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark",
				children: "Send magic link"
			})
		]
	});
});
//#endregion
//#region \0virtual:react-router/server-manifest
var server_manifest_default = {
	"entry": {
		"module": "/assets/entry.client-B8qahMO9.js",
		"imports": ["/assets/jsx-runtime-DRqUxo5a.js"],
		"css": []
	},
	"routes": {
		"root": {
			"id": "root",
			"parentId": void 0,
			"path": "",
			"index": void 0,
			"caseSensitive": void 0,
			"hasAction": false,
			"hasLoader": false,
			"hasClientAction": false,
			"hasClientLoader": false,
			"hasClientMiddleware": false,
			"hasDefaultExport": true,
			"hasErrorBoundary": true,
			"module": "/assets/root-ifTGRue2.js",
			"imports": ["/assets/jsx-runtime-DRqUxo5a.js"],
			"css": [],
			"clientActionModule": void 0,
			"clientLoaderModule": void 0,
			"clientMiddlewareModule": void 0,
			"hydrateFallbackModule": void 0
		},
		"portals/customer/CustomerLayout": {
			"id": "portals/customer/CustomerLayout",
			"parentId": "root",
			"path": void 0,
			"index": void 0,
			"caseSensitive": void 0,
			"hasAction": false,
			"hasLoader": true,
			"hasClientAction": false,
			"hasClientLoader": false,
			"hasClientMiddleware": false,
			"hasDefaultExport": true,
			"hasErrorBoundary": false,
			"module": "/assets/CustomerLayout-CZ-BYvk-.js",
			"imports": [
				"/assets/jsx-runtime-DRqUxo5a.js",
				"/assets/supabase.client-B-ZSwB6b.js",
				"/assets/createLucideIcon-hgiyojVj.js",
				"/assets/clipboard-list-CQzGiMWi.js",
				"/assets/sparkles-CxCiFjf6.js",
				"/assets/customer-store-hook-CkmCtUwj.js",
				"/assets/customer-store-BxTdowZI.js"
			],
			"css": [],
			"clientActionModule": void 0,
			"clientLoaderModule": void 0,
			"clientMiddlewareModule": void 0,
			"hydrateFallbackModule": void 0
		},
		"portals/customer/pages/Home": {
			"id": "portals/customer/pages/Home",
			"parentId": "portals/customer/CustomerLayout",
			"path": void 0,
			"index": true,
			"caseSensitive": void 0,
			"hasAction": false,
			"hasLoader": false,
			"hasClientAction": false,
			"hasClientLoader": false,
			"hasClientMiddleware": false,
			"hasDefaultExport": true,
			"hasErrorBoundary": false,
			"module": "/assets/Home-CDCFxY5V.js",
			"imports": [
				"/assets/jsx-runtime-DRqUxo5a.js",
				"/assets/createLucideIcon-hgiyojVj.js",
				"/assets/clipboard-list-CQzGiMWi.js",
				"/assets/NewOrder-Bh7SI8E1.js",
				"/assets/sparkles-CxCiFjf6.js",
				"/assets/customer-store-hook-CkmCtUwj.js"
			],
			"css": [],
			"clientActionModule": void 0,
			"clientLoaderModule": void 0,
			"clientMiddlewareModule": void 0,
			"hydrateFallbackModule": void 0
		},
		"portals/customer/pages/Transactions": {
			"id": "portals/customer/pages/Transactions",
			"parentId": "portals/customer/CustomerLayout",
			"path": "transactions",
			"index": void 0,
			"caseSensitive": void 0,
			"hasAction": false,
			"hasLoader": false,
			"hasClientAction": false,
			"hasClientLoader": false,
			"hasClientMiddleware": false,
			"hasDefaultExport": true,
			"hasErrorBoundary": false,
			"module": "/assets/Transactions-Cfys7tUK.js",
			"imports": ["/assets/jsx-runtime-DRqUxo5a.js"],
			"css": [],
			"clientActionModule": void 0,
			"clientLoaderModule": void 0,
			"clientMiddlewareModule": void 0,
			"hydrateFallbackModule": void 0
		},
		"portals/customer/pages/Orders": {
			"id": "portals/customer/pages/Orders",
			"parentId": "portals/customer/CustomerLayout",
			"path": "orders",
			"index": void 0,
			"caseSensitive": void 0,
			"hasAction": false,
			"hasLoader": false,
			"hasClientAction": false,
			"hasClientLoader": false,
			"hasClientMiddleware": false,
			"hasDefaultExport": true,
			"hasErrorBoundary": false,
			"module": "/assets/Orders-BM-9HD7y.js",
			"imports": [
				"/assets/jsx-runtime-DRqUxo5a.js",
				"/assets/NewOrder-Bh7SI8E1.js",
				"/assets/customer-store-hook-CkmCtUwj.js",
				"/assets/customer-store-BxTdowZI.js",
				"/assets/createLucideIcon-hgiyojVj.js"
			],
			"css": [],
			"clientActionModule": void 0,
			"clientLoaderModule": void 0,
			"clientMiddlewareModule": void 0,
			"hydrateFallbackModule": void 0
		},
		"portals/customer/pages/Plans": {
			"id": "portals/customer/pages/Plans",
			"parentId": "portals/customer/CustomerLayout",
			"path": "plans",
			"index": void 0,
			"caseSensitive": void 0,
			"hasAction": false,
			"hasLoader": false,
			"hasClientAction": false,
			"hasClientLoader": false,
			"hasClientMiddleware": false,
			"hasDefaultExport": true,
			"hasErrorBoundary": false,
			"module": "/assets/Plans-FFzvJPD1.js",
			"imports": [
				"/assets/jsx-runtime-DRqUxo5a.js",
				"/assets/createLucideIcon-hgiyojVj.js",
				"/assets/sparkles-CxCiFjf6.js"
			],
			"css": [],
			"clientActionModule": void 0,
			"clientLoaderModule": void 0,
			"clientMiddlewareModule": void 0,
			"hydrateFallbackModule": void 0
		},
		"portals/customer/pages/Settings": {
			"id": "portals/customer/pages/Settings",
			"parentId": "portals/customer/CustomerLayout",
			"path": "settings",
			"index": void 0,
			"caseSensitive": void 0,
			"hasAction": false,
			"hasLoader": false,
			"hasClientAction": false,
			"hasClientLoader": false,
			"hasClientMiddleware": false,
			"hasDefaultExport": true,
			"hasErrorBoundary": false,
			"module": "/assets/Settings-BQqSFox2.js",
			"imports": ["/assets/jsx-runtime-DRqUxo5a.js"],
			"css": [],
			"clientActionModule": void 0,
			"clientLoaderModule": void 0,
			"clientMiddlewareModule": void 0,
			"hydrateFallbackModule": void 0
		},
		"portals/customer/pages/Invoice": {
			"id": "portals/customer/pages/Invoice",
			"parentId": "portals/customer/CustomerLayout",
			"path": "invoice",
			"index": void 0,
			"caseSensitive": void 0,
			"hasAction": false,
			"hasLoader": false,
			"hasClientAction": false,
			"hasClientLoader": false,
			"hasClientMiddleware": false,
			"hasDefaultExport": true,
			"hasErrorBoundary": false,
			"module": "/assets/Invoice-BD38rNxY.js",
			"imports": ["/assets/jsx-runtime-DRqUxo5a.js"],
			"css": [],
			"clientActionModule": void 0,
			"clientLoaderModule": void 0,
			"clientMiddlewareModule": void 0,
			"hydrateFallbackModule": void 0
		},
		"portals/customer/pages/OtpFlow": {
			"id": "portals/customer/pages/OtpFlow",
			"parentId": "portals/customer/CustomerLayout",
			"path": "otp",
			"index": void 0,
			"caseSensitive": void 0,
			"hasAction": false,
			"hasLoader": false,
			"hasClientAction": false,
			"hasClientLoader": false,
			"hasClientMiddleware": false,
			"hasDefaultExport": true,
			"hasErrorBoundary": false,
			"module": "/assets/OtpFlow-C9bWYKhW.js",
			"imports": ["/assets/jsx-runtime-DRqUxo5a.js", "/assets/customer-store-hook-CkmCtUwj.js"],
			"css": [],
			"clientActionModule": void 0,
			"clientLoaderModule": void 0,
			"clientMiddlewareModule": void 0,
			"hydrateFallbackModule": void 0
		},
		"portals/customer/pages/Login": {
			"id": "portals/customer/pages/Login",
			"parentId": "root",
			"path": "login",
			"index": void 0,
			"caseSensitive": void 0,
			"hasAction": false,
			"hasLoader": false,
			"hasClientAction": false,
			"hasClientLoader": false,
			"hasClientMiddleware": false,
			"hasDefaultExport": true,
			"hasErrorBoundary": false,
			"module": "/assets/Login-BCFwjXRc.js",
			"imports": ["/assets/jsx-runtime-DRqUxo5a.js", "/assets/supabase.client-B-ZSwB6b.js"],
			"css": [],
			"clientActionModule": void 0,
			"clientLoaderModule": void 0,
			"clientMiddlewareModule": void 0,
			"hydrateFallbackModule": void 0
		},
		"portals/customer/pages/CreateAccount": {
			"id": "portals/customer/pages/CreateAccount",
			"parentId": "root",
			"path": "create-account",
			"index": void 0,
			"caseSensitive": void 0,
			"hasAction": false,
			"hasLoader": false,
			"hasClientAction": false,
			"hasClientLoader": false,
			"hasClientMiddleware": false,
			"hasDefaultExport": true,
			"hasErrorBoundary": false,
			"module": "/assets/CreateAccount-vWAKa7cQ.js",
			"imports": ["/assets/jsx-runtime-DRqUxo5a.js", "/assets/supabase.client-B-ZSwB6b.js"],
			"css": [],
			"clientActionModule": void 0,
			"clientLoaderModule": void 0,
			"clientMiddlewareModule": void 0,
			"hydrateFallbackModule": void 0
		},
		"portals/customer/pages/VerifyOtp": {
			"id": "portals/customer/pages/VerifyOtp",
			"parentId": "root",
			"path": "verify-otp",
			"index": void 0,
			"caseSensitive": void 0,
			"hasAction": false,
			"hasLoader": false,
			"hasClientAction": false,
			"hasClientLoader": false,
			"hasClientMiddleware": false,
			"hasDefaultExport": true,
			"hasErrorBoundary": false,
			"module": "/assets/VerifyOtp-D19MbEj2.js",
			"imports": ["/assets/jsx-runtime-DRqUxo5a.js", "/assets/supabase.client-B-ZSwB6b.js"],
			"css": [],
			"clientActionModule": void 0,
			"clientLoaderModule": void 0,
			"clientMiddlewareModule": void 0,
			"hydrateFallbackModule": void 0
		},
		"portals/logistics/LogisticsLayout": {
			"id": "portals/logistics/LogisticsLayout",
			"parentId": "root",
			"path": void 0,
			"index": void 0,
			"caseSensitive": void 0,
			"hasAction": false,
			"hasLoader": false,
			"hasClientAction": false,
			"hasClientLoader": false,
			"hasClientMiddleware": false,
			"hasDefaultExport": true,
			"hasErrorBoundary": false,
			"module": "/assets/LogisticsLayout-CYKrWtQt.js",
			"imports": ["/assets/jsx-runtime-DRqUxo5a.js"],
			"css": [],
			"clientActionModule": void 0,
			"clientLoaderModule": void 0,
			"clientMiddlewareModule": void 0,
			"hydrateFallbackModule": void 0
		},
		"portals/logistics/pages/Home": {
			"id": "portals/logistics/pages/Home",
			"parentId": "portals/logistics/LogisticsLayout",
			"path": "logistics",
			"index": true,
			"caseSensitive": void 0,
			"hasAction": false,
			"hasLoader": false,
			"hasClientAction": false,
			"hasClientLoader": false,
			"hasClientMiddleware": false,
			"hasDefaultExport": true,
			"hasErrorBoundary": false,
			"module": "/assets/Home-CmIslT6C.js",
			"imports": ["/assets/jsx-runtime-DRqUxo5a.js"],
			"css": [],
			"clientActionModule": void 0,
			"clientLoaderModule": void 0,
			"clientMiddlewareModule": void 0,
			"hydrateFallbackModule": void 0
		},
		"logistics-delivery": {
			"id": "logistics-delivery",
			"parentId": "portals/logistics/LogisticsLayout",
			"path": "logistics/delivery",
			"index": void 0,
			"caseSensitive": void 0,
			"hasAction": false,
			"hasLoader": false,
			"hasClientAction": false,
			"hasClientLoader": false,
			"hasClientMiddleware": false,
			"hasDefaultExport": true,
			"hasErrorBoundary": false,
			"module": "/assets/Delivery-QxkmEeyZ.js",
			"imports": ["/assets/jsx-runtime-DRqUxo5a.js"],
			"css": [],
			"clientActionModule": void 0,
			"clientLoaderModule": void 0,
			"clientMiddlewareModule": void 0,
			"hydrateFallbackModule": void 0
		},
		"portals/logistics/pages/Login": {
			"id": "portals/logistics/pages/Login",
			"parentId": "root",
			"path": "logistics/login",
			"index": void 0,
			"caseSensitive": void 0,
			"hasAction": false,
			"hasLoader": false,
			"hasClientAction": false,
			"hasClientLoader": false,
			"hasClientMiddleware": false,
			"hasDefaultExport": true,
			"hasErrorBoundary": false,
			"module": "/assets/Login-D1Fc3V16.js",
			"imports": ["/assets/jsx-runtime-DRqUxo5a.js"],
			"css": [],
			"clientActionModule": void 0,
			"clientLoaderModule": void 0,
			"clientMiddlewareModule": void 0,
			"hydrateFallbackModule": void 0
		},
		"portals/vendor/VendorLayout": {
			"id": "portals/vendor/VendorLayout",
			"parentId": "root",
			"path": void 0,
			"index": void 0,
			"caseSensitive": void 0,
			"hasAction": false,
			"hasLoader": false,
			"hasClientAction": false,
			"hasClientLoader": false,
			"hasClientMiddleware": false,
			"hasDefaultExport": true,
			"hasErrorBoundary": false,
			"module": "/assets/VendorLayout-CpjNokn5.js",
			"imports": ["/assets/jsx-runtime-DRqUxo5a.js"],
			"css": [],
			"clientActionModule": void 0,
			"clientLoaderModule": void 0,
			"clientMiddlewareModule": void 0,
			"hydrateFallbackModule": void 0
		},
		"portals/vendor/pages/Home": {
			"id": "portals/vendor/pages/Home",
			"parentId": "portals/vendor/VendorLayout",
			"path": "vendor",
			"index": true,
			"caseSensitive": void 0,
			"hasAction": false,
			"hasLoader": false,
			"hasClientAction": false,
			"hasClientLoader": false,
			"hasClientMiddleware": false,
			"hasDefaultExport": true,
			"hasErrorBoundary": false,
			"module": "/assets/Home-BLxyfrO_.js",
			"imports": ["/assets/jsx-runtime-DRqUxo5a.js"],
			"css": [],
			"clientActionModule": void 0,
			"clientLoaderModule": void 0,
			"clientMiddlewareModule": void 0,
			"hydrateFallbackModule": void 0
		},
		"portals/vendor/pages/Login": {
			"id": "portals/vendor/pages/Login",
			"parentId": "root",
			"path": "vendor/login",
			"index": void 0,
			"caseSensitive": void 0,
			"hasAction": false,
			"hasLoader": false,
			"hasClientAction": false,
			"hasClientLoader": false,
			"hasClientMiddleware": false,
			"hasDefaultExport": true,
			"hasErrorBoundary": false,
			"module": "/assets/Login-CAHjM0Bm.js",
			"imports": ["/assets/jsx-runtime-DRqUxo5a.js"],
			"css": [],
			"clientActionModule": void 0,
			"clientLoaderModule": void 0,
			"clientMiddlewareModule": void 0,
			"hydrateFallbackModule": void 0
		},
		"portals/admin/AdminLayout": {
			"id": "portals/admin/AdminLayout",
			"parentId": "root",
			"path": void 0,
			"index": void 0,
			"caseSensitive": void 0,
			"hasAction": false,
			"hasLoader": false,
			"hasClientAction": false,
			"hasClientLoader": false,
			"hasClientMiddleware": false,
			"hasDefaultExport": true,
			"hasErrorBoundary": false,
			"module": "/assets/AdminLayout-BQK8HLBC.js",
			"imports": ["/assets/jsx-runtime-DRqUxo5a.js"],
			"css": [],
			"clientActionModule": void 0,
			"clientLoaderModule": void 0,
			"clientMiddlewareModule": void 0,
			"hydrateFallbackModule": void 0
		},
		"portals/admin/pages/Home": {
			"id": "portals/admin/pages/Home",
			"parentId": "portals/admin/AdminLayout",
			"path": "admin",
			"index": true,
			"caseSensitive": void 0,
			"hasAction": false,
			"hasLoader": false,
			"hasClientAction": false,
			"hasClientLoader": false,
			"hasClientMiddleware": false,
			"hasDefaultExport": true,
			"hasErrorBoundary": false,
			"module": "/assets/Home-ecZ4AjV4.js",
			"imports": ["/assets/jsx-runtime-DRqUxo5a.js"],
			"css": [],
			"clientActionModule": void 0,
			"clientLoaderModule": void 0,
			"clientMiddlewareModule": void 0,
			"hydrateFallbackModule": void 0
		},
		"portals/admin/pages/Login": {
			"id": "portals/admin/pages/Login",
			"parentId": "root",
			"path": "admin/login",
			"index": void 0,
			"caseSensitive": void 0,
			"hasAction": false,
			"hasLoader": false,
			"hasClientAction": false,
			"hasClientLoader": false,
			"hasClientMiddleware": false,
			"hasDefaultExport": true,
			"hasErrorBoundary": false,
			"module": "/assets/Login-B9XmYl10.js",
			"imports": ["/assets/jsx-runtime-DRqUxo5a.js"],
			"css": [],
			"clientActionModule": void 0,
			"clientLoaderModule": void 0,
			"clientMiddlewareModule": void 0,
			"hydrateFallbackModule": void 0
		}
	},
	"url": "/assets/manifest-680e5950.js",
	"version": "680e5950",
	"sri": void 0
};
//#endregion
//#region \0virtual:react-router/server-build
var assetsBuildDirectory = "build\\client";
var basename = "/";
var future = {
	"unstable_optimizeDeps": false,
	"v8_passThroughRequests": false,
	"v8_trailingSlashAwareDataRequests": false,
	"unstable_previewServerPrerendering": false,
	"v8_middleware": false,
	"v8_splitRouteModules": false,
	"v8_viteEnvironmentApi": false
};
var ssr = true;
var isSpaMode = false;
var prerender = [];
var routeDiscovery = {
	"mode": "lazy",
	"manifestPath": "/__manifest"
};
var publicPath = "/";
var entry = { module: entry_server_node_exports };
var routes = {
	"root": {
		id: "root",
		parentId: void 0,
		path: "",
		index: void 0,
		caseSensitive: void 0,
		module: root_exports
	},
	"portals/customer/CustomerLayout": {
		id: "portals/customer/CustomerLayout",
		parentId: "root",
		path: void 0,
		index: void 0,
		caseSensitive: void 0,
		module: CustomerLayout_exports
	},
	"portals/customer/pages/Home": {
		id: "portals/customer/pages/Home",
		parentId: "portals/customer/CustomerLayout",
		path: void 0,
		index: true,
		caseSensitive: void 0,
		module: Home_exports$3
	},
	"portals/customer/pages/Transactions": {
		id: "portals/customer/pages/Transactions",
		parentId: "portals/customer/CustomerLayout",
		path: "transactions",
		index: void 0,
		caseSensitive: void 0,
		module: Transactions_exports
	},
	"portals/customer/pages/Orders": {
		id: "portals/customer/pages/Orders",
		parentId: "portals/customer/CustomerLayout",
		path: "orders",
		index: void 0,
		caseSensitive: void 0,
		module: Orders_exports
	},
	"portals/customer/pages/Plans": {
		id: "portals/customer/pages/Plans",
		parentId: "portals/customer/CustomerLayout",
		path: "plans",
		index: void 0,
		caseSensitive: void 0,
		module: Plans_exports
	},
	"portals/customer/pages/Settings": {
		id: "portals/customer/pages/Settings",
		parentId: "portals/customer/CustomerLayout",
		path: "settings",
		index: void 0,
		caseSensitive: void 0,
		module: Settings_exports
	},
	"portals/customer/pages/Invoice": {
		id: "portals/customer/pages/Invoice",
		parentId: "portals/customer/CustomerLayout",
		path: "invoice",
		index: void 0,
		caseSensitive: void 0,
		module: Invoice_exports
	},
	"portals/customer/pages/OtpFlow": {
		id: "portals/customer/pages/OtpFlow",
		parentId: "portals/customer/CustomerLayout",
		path: "otp",
		index: void 0,
		caseSensitive: void 0,
		module: OtpFlow_exports
	},
	"portals/customer/pages/Login": {
		id: "portals/customer/pages/Login",
		parentId: "root",
		path: "login",
		index: void 0,
		caseSensitive: void 0,
		module: Login_exports$3
	},
	"portals/customer/pages/CreateAccount": {
		id: "portals/customer/pages/CreateAccount",
		parentId: "root",
		path: "create-account",
		index: void 0,
		caseSensitive: void 0,
		module: CreateAccount_exports
	},
	"portals/customer/pages/VerifyOtp": {
		id: "portals/customer/pages/VerifyOtp",
		parentId: "root",
		path: "verify-otp",
		index: void 0,
		caseSensitive: void 0,
		module: VerifyOtp_exports
	},
	"portals/logistics/LogisticsLayout": {
		id: "portals/logistics/LogisticsLayout",
		parentId: "root",
		path: void 0,
		index: void 0,
		caseSensitive: void 0,
		module: LogisticsLayout_exports
	},
	"portals/logistics/pages/Home": {
		id: "portals/logistics/pages/Home",
		parentId: "portals/logistics/LogisticsLayout",
		path: "logistics",
		index: true,
		caseSensitive: void 0,
		module: Home_exports$2
	},
	"logistics-delivery": {
		id: "logistics-delivery",
		parentId: "portals/logistics/LogisticsLayout",
		path: "logistics/delivery",
		index: void 0,
		caseSensitive: void 0,
		module: Delivery_exports
	},
	"portals/logistics/pages/Login": {
		id: "portals/logistics/pages/Login",
		parentId: "root",
		path: "logistics/login",
		index: void 0,
		caseSensitive: void 0,
		module: Login_exports$2
	},
	"portals/vendor/VendorLayout": {
		id: "portals/vendor/VendorLayout",
		parentId: "root",
		path: void 0,
		index: void 0,
		caseSensitive: void 0,
		module: VendorLayout_exports
	},
	"portals/vendor/pages/Home": {
		id: "portals/vendor/pages/Home",
		parentId: "portals/vendor/VendorLayout",
		path: "vendor",
		index: true,
		caseSensitive: void 0,
		module: Home_exports$1
	},
	"portals/vendor/pages/Login": {
		id: "portals/vendor/pages/Login",
		parentId: "root",
		path: "vendor/login",
		index: void 0,
		caseSensitive: void 0,
		module: Login_exports$1
	},
	"portals/admin/AdminLayout": {
		id: "portals/admin/AdminLayout",
		parentId: "root",
		path: void 0,
		index: void 0,
		caseSensitive: void 0,
		module: AdminLayout_exports
	},
	"portals/admin/pages/Home": {
		id: "portals/admin/pages/Home",
		parentId: "portals/admin/AdminLayout",
		path: "admin",
		index: true,
		caseSensitive: void 0,
		module: Home_exports
	},
	"portals/admin/pages/Login": {
		id: "portals/admin/pages/Login",
		parentId: "root",
		path: "admin/login",
		index: void 0,
		caseSensitive: void 0,
		module: Login_exports
	}
};
var allowedActionOrigins = false;
//#endregion
export { allowedActionOrigins, server_manifest_default as assets, assetsBuildDirectory, basename, entry, future, isSpaMode, prerender, publicPath, routeDiscovery, routes, ssr };
