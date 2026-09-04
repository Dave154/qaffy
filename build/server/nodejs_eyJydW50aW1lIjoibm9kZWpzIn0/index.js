import { PassThrough } from "node:stream";
import { createReadableStreamFromReadable } from "@react-router/node";
import { Links, Meta, NavLink, Outlet, Scripts, ScrollRestoration, ServerRouter, UNSAFE_withComponentProps, UNSAFE_withErrorBoundaryProps, isRouteErrorResponse } from "react-router";
import { isbot } from "isbot";
import { renderToPipeableStream } from "react-dom/server";
import { jsx, jsxs } from "react/jsx-runtime";
import { useState } from "react";
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
var src_default = "/assets/index-zwutKYoK.css";
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
//#region src/portals/customer/CustomerLayout.tsx
var CustomerLayout_exports = /* @__PURE__ */ __exportAll({ default: () => CustomerLayout_default });
var navItems$1 = [
	{
		to: "/",
		label: "Home",
		icon: "⌂",
		end: true
	},
	{
		to: "/transactions",
		label: "Transactions",
		icon: "◈"
	},
	{
		to: "/orders",
		label: "Orders",
		icon: "▣"
	},
	{
		to: "/plans",
		label: "Plans",
		icon: "◎"
	},
	{
		to: "/settings",
		label: "Settings",
		icon: "⚙"
	}
];
var CustomerLayout_default = UNSAFE_withComponentProps(function CustomerLayout() {
	return /* @__PURE__ */ jsxs("div", {
		className: "min-h-screen bg-transparent text-slate-900 lg:flex",
		children: [/* @__PURE__ */ jsxs("aside", {
			className: "hidden min-h-screen w-64 shrink-0 border-r border-violet-100 bg-white/80 px-5 py-6 backdrop-blur-xl lg:flex lg:flex-col",
			children: [
				/* @__PURE__ */ jsxs("div", {
					className: "mb-10 flex items-start justify-between",
					children: [/* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("h1", {
						className: "text-2xl font-bold tracking-tight text-slate-900",
						children: "Qaffy"
					}), /* @__PURE__ */ jsx("p", {
						className: "mt-1 text-sm text-slate-500",
						children: "Your personal laundry space"
					})] }), /* @__PURE__ */ jsx("button", {
						type: "button",
						className: "flex h-10 w-10 items-center justify-center rounded-full border border-violet-100 bg-violet-50 text-sm font-semibold text-violet-700 shadow-sm",
						children: "A"
					})]
				}),
				/* @__PURE__ */ jsx("nav", {
					className: "rounded-[26px] border border-slate-100 bg-slate-50/80 p-2",
					children: navItems$1.map((item) => /* @__PURE__ */ jsxs(NavLink, {
						to: item.to,
						end: item.end,
						className: ({ isActive }) => `flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium transition ${isActive ? "bg-white text-violet-700 shadow-sm ring-1 ring-violet-100" : "text-slate-500 hover:bg-white hover:text-violet-700"}`,
						children: [/* @__PURE__ */ jsx("span", {
							className: "flex h-8 w-8 items-center justify-center rounded-xl bg-violet-100/80 text-sm text-violet-600",
							children: item.icon
						}), /* @__PURE__ */ jsx("span", { children: item.label })]
					}, item.to))
				}),
				/* @__PURE__ */ jsxs("div", {
					className: "mt-auto rounded-2xl bg-slate-900 p-4 text-white",
					children: [
						/* @__PURE__ */ jsx("p", {
							className: "text-xs font-medium text-violet-200",
							children: "Weekly Plus"
						}),
						/* @__PURE__ */ jsx("p", {
							className: "mt-2 text-sm font-semibold",
							children: "4 bags remaining"
						}),
						/* @__PURE__ */ jsx("div", {
							className: "mt-3 h-1.5 overflow-hidden rounded-full bg-white/20",
							children: /* @__PURE__ */ jsx("div", { className: "h-full w-3/4 rounded-full bg-violet-400" })
						})
					]
				})
			]
		}), /* @__PURE__ */ jsxs("div", {
			className: "min-w-0 flex-1",
			children: [
				/* @__PURE__ */ jsx("header", {
					className: "sticky top-0 z-20 border-b border-violet-100 bg-white/80 backdrop-blur-xl lg:hidden",
					children: /* @__PURE__ */ jsxs("div", {
						className: "mx-auto flex max-w-3xl items-center justify-between px-4 py-3.5 sm:px-6",
						children: [/* @__PURE__ */ jsx("div", { children: /* @__PURE__ */ jsx("h1", {
							className: "text-xl font-bold tracking-tight text-slate-900",
							children: "Qaffy"
						}) }), /* @__PURE__ */ jsx("button", {
							type: "button",
							className: "flex h-10 w-10 items-center justify-center rounded-full border border-violet-100 bg-violet-50 text-sm font-semibold text-violet-700 shadow-sm",
							children: "A"
						})]
					})
				}),
				/* @__PURE__ */ jsx("main", {
					className: "mx-auto w-full max-w-6xl px-4 pb-28 pt-4 sm:px-6 sm:pt-6 lg:px-8 lg:pb-10 lg:pt-8",
					children: /* @__PURE__ */ jsx(Outlet, {})
				}),
				/* @__PURE__ */ jsx("nav", {
					className: "fixed inset-x-0 bottom-0 z-30 px-2 pb-3 lg:hidden sm:px-3",
					children: /* @__PURE__ */ jsx("div", {
						className: "mx-auto flex max-w-2xl gap-1 overflow-x-auto rounded-[26px] border border-white/80 bg-white/95 p-2 shadow-[0_12px_40px_rgba(76,29,149,0.16)] backdrop-blur-xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
						children: navItems$1.map((item) => /* @__PURE__ */ jsxs(NavLink, {
							to: item.to,
							end: item.end,
							className: ({ isActive }) => `flex min-w-[70px] shrink-0 flex-col items-center gap-1.5 rounded-2xl px-2.5 py-2.5 text-xs font-medium transition sm:min-w-[78px] sm:px-3 ${isActive ? "bg-violet-600 text-white shadow-md shadow-violet-200" : "text-slate-500 hover:bg-violet-50 hover:text-violet-700"}`,
							children: [/* @__PURE__ */ jsx("span", {
								className: "flex h-8 w-8 items-center justify-center rounded-xl bg-violet-100/80 text-base text-violet-600",
								children: item.icon
							}), /* @__PURE__ */ jsx("span", {
								className: "whitespace-nowrap",
								children: item.label
							})]
						}, item.to))
					})
				})
			]
		})]
	});
});
//#endregion
//#region src/portals/customer/pages/NewOrder.tsx
var services = [
	{
		name: "Wash",
		description: "Clean and fold",
		price: 600,
		icon: "◌"
	},
	{
		name: "Iron",
		description: "Pressed and ready",
		price: 500,
		icon: "◇"
	},
	{
		name: "Wash + Iron",
		description: "Clean, pressed and folded",
		price: 800,
		icon: "✦"
	}
];
function NewOrder({ onClose }) {
	const [selectedService, setSelectedService] = useState("Wash + Iron");
	const [clothes, setClothes] = useState(6);
	const selected = services.find((service) => service.name === selectedService) ?? services[2];
	const estimatedTotal = Math.max(clothes, 1) * selected.price;
	return /* @__PURE__ */ jsx("div", {
		className: "fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-sm sm:items-center sm:p-4",
		role: "presentation",
		onMouseDown: onClose,
		children: /* @__PURE__ */ jsxs("section", {
			role: "dialog",
			"aria-modal": "true",
			"aria-labelledby": "new-order-title",
			onMouseDown: (event) => event.stopPropagation(),
			className: "max-h-[94vh] w-full overflow-y-auto rounded-t-[30px] bg-slate-50 p-4 shadow-2xl shadow-slate-950/20 sm:max-w-2xl sm:rounded-[30px] sm:p-6",
			children: [
				/* @__PURE__ */ jsxs("header", {
					className: "flex items-start justify-between gap-3",
					children: [/* @__PURE__ */ jsxs("div", { children: [
						/* @__PURE__ */ jsx("p", {
							className: "text-sm font-medium text-violet-600",
							children: "Fresh start"
						}),
						/* @__PURE__ */ jsx("h2", {
							id: "new-order-title",
							className: "mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl",
							children: "Create an order"
						}),
						/* @__PURE__ */ jsx("p", {
							className: "mt-1 text-sm text-slate-500",
							children: "Tell us what you would like us to care for."
						})
					] }), /* @__PURE__ */ jsx("button", {
						type: "button",
						onClick: onClose,
						"aria-label": "Close new order",
						className: "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-xl text-slate-500 shadow-sm transition hover:border-violet-200 hover:text-violet-700",
						children: "×"
					})]
				}),
				/* @__PURE__ */ jsxs("section", {
					className: "mt-5 rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm shadow-slate-100 sm:p-5",
					children: [/* @__PURE__ */ jsxs("div", {
						className: "flex items-center justify-between gap-3",
						children: [/* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("h3", {
							className: "text-lg font-bold text-slate-900",
							children: "Choose a service"
						}), /* @__PURE__ */ jsx("p", {
							className: "mt-1 text-sm text-slate-500",
							children: "Select one option for this pickup."
						})] }), /* @__PURE__ */ jsx("span", {
							className: "rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700",
							children: "Step 1 of 3"
						})]
					}), /* @__PURE__ */ jsx("div", {
						className: "mt-4 grid gap-3 sm:grid-cols-3",
						children: services.map((service) => {
							const isSelected = service.name === selectedService;
							return /* @__PURE__ */ jsxs("button", {
								type: "button",
								onClick: () => setSelectedService(service.name),
								className: `relative rounded-2xl border p-4 text-left transition ${isSelected ? "border-violet-500 bg-violet-50 ring-2 ring-violet-100" : "border-slate-200 bg-slate-50 hover:border-violet-200 hover:bg-violet-50/50"}`,
								children: [
									/* @__PURE__ */ jsx("span", {
										className: `flex h-10 w-10 items-center justify-center rounded-xl text-lg ${isSelected ? "bg-violet-600 text-white" : "bg-white text-violet-600"}`,
										children: service.icon
									}),
									/* @__PURE__ */ jsx("span", {
										className: "mt-3 block font-semibold text-slate-900",
										children: service.name
									}),
									/* @__PURE__ */ jsx("span", {
										className: "mt-1 block text-xs text-slate-500",
										children: service.description
									}),
									/* @__PURE__ */ jsxs("span", {
										className: "mt-3 block text-sm font-semibold text-violet-700",
										children: ["From ₦", service.price.toLocaleString()]
									}),
									isSelected && /* @__PURE__ */ jsx("span", {
										className: "absolute right-3 top-3 text-sm font-bold text-violet-600",
										children: "✓"
									})
								]
							}, service.name);
						})
					})]
				}),
				/* @__PURE__ */ jsxs("section", {
					className: "rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm shadow-slate-100 sm:p-5",
					children: [
						/* @__PURE__ */ jsxs("div", {
							className: "flex items-center justify-between gap-3",
							children: [/* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("h3", {
								className: "text-lg font-bold text-slate-900",
								children: "Your laundry"
							}), /* @__PURE__ */ jsx("p", {
								className: "mt-1 text-sm text-slate-500",
								children: "Give us an estimate of the items in your bag."
							})] }), /* @__PURE__ */ jsx("span", {
								className: "text-2xl",
								children: "🧺"
							})]
						}),
						/* @__PURE__ */ jsxs("label", {
							className: "mt-4 block",
							children: [/* @__PURE__ */ jsx("span", {
								className: "mb-1.5 block text-sm font-medium text-slate-600",
								children: "Number of clothes"
							}), /* @__PURE__ */ jsx("input", {
								type: "number",
								min: "1",
								value: clothes,
								onChange: (event) => setClothes(Number(event.target.value)),
								className: "w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-base text-slate-900 focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
							})]
						}),
						/* @__PURE__ */ jsxs("label", {
							className: "mt-4 block",
							children: [/* @__PURE__ */ jsxs("span", {
								className: "mb-1.5 block text-sm font-medium text-slate-600",
								children: ["Pickup instructions ", /* @__PURE__ */ jsx("span", {
									className: "font-normal text-slate-400",
									children: "(optional)"
								})]
							}), /* @__PURE__ */ jsx("textarea", {
								rows: 3,
								placeholder: "Separate whites, handle silk carefully...",
								className: "w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
							})]
						})
					]
				}),
				/* @__PURE__ */ jsxs("section", {
					className: "rounded-[26px] bg-slate-950 p-5 text-white shadow-lg shadow-slate-200 sm:p-6",
					children: [/* @__PURE__ */ jsxs("div", {
						className: "flex items-start justify-between gap-4",
						children: [/* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("p", {
							className: "text-xs font-medium uppercase tracking-[0.18em] text-violet-300",
							children: "Order estimate"
						}), /* @__PURE__ */ jsxs("p", {
							className: "mt-2 text-sm text-slate-300",
							children: [
								clothes || 0,
								" clothes × ",
								selected.name
							]
						})] }), /* @__PURE__ */ jsxs("div", {
							className: "text-right",
							children: [/* @__PURE__ */ jsxs("p", {
								className: "text-2xl font-bold",
								children: ["₦", estimatedTotal.toLocaleString()]
							}), /* @__PURE__ */ jsx("p", {
								className: "mt-1 text-xs text-slate-400",
								children: "Final amount after intake"
							})]
						})]
					}), /* @__PURE__ */ jsx("button", {
						type: "button",
						className: "mt-5 w-full rounded-2xl bg-violet-500 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-violet-950 transition hover:bg-violet-400",
						children: "Continue to pickup details"
					})]
				})
			]
		})
	});
}
//#endregion
//#region src/portals/customer/pages/Home.tsx
var Home_exports$3 = /* @__PURE__ */ __exportAll({ default: () => Home_default$3 });
var recentOrders = [
	{
		id: "QF-1042",
		status: "Picked up",
		total: "₦4,800",
		date: "Today"
	},
	{
		id: "QF-1038",
		status: "Ready for delivery",
		total: "₦7,200",
		date: "Yesterday"
	},
	{
		id: "QF-1027",
		status: "Delivered",
		total: "₦5,500",
		date: "Mon"
	}
];
var Home_default$3 = UNSAFE_withComponentProps(function Home() {
	const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
	return /* @__PURE__ */ jsxs("div", {
		className: "space-y-5 pb-8",
		children: [
			/* @__PURE__ */ jsxs("div", {
				className: "flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between",
				children: [/* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("p", {
					className: "text-sm font-medium text-violet-600",
					children: "Good morning, Aisha"
				}), /* @__PURE__ */ jsx("h2", {
					className: "mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl",
					children: "Your laundry, sorted."
				})] }), /* @__PURE__ */ jsx("p", {
					className: "text-sm text-slate-500",
					children: "Tuesday, 4 Sep 2026"
				})]
			}),
			/* @__PURE__ */ jsxs("section", {
				className: "rounded-[28px] bg-gradient-to-br from-violet-600 via-violet-700 to-fuchsia-500 p-5 text-white shadow-lg shadow-violet-200 sm:p-6",
				children: [/* @__PURE__ */ jsxs("div", {
					className: "flex items-center justify-between",
					children: [/* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("p", {
						className: "text-xs font-medium uppercase tracking-[0.18em] text-violet-100",
						children: "Wallet balance"
					}), /* @__PURE__ */ jsx("h2", {
						className: "mt-2 text-3xl font-bold",
						children: "₦18,750"
					})] }), /* @__PURE__ */ jsx("div", {
						className: "rounded-2xl bg-white/15 p-2.5 text-xl backdrop-blur-sm",
						children: "💳"
					})]
				}), /* @__PURE__ */ jsxs("div", {
					className: "mt-5 flex gap-2",
					children: [/* @__PURE__ */ jsx("button", {
						type: "button",
						className: "flex-1 rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-violet-700 shadow-sm",
						children: "Top up"
					}), /* @__PURE__ */ jsx("button", {
						type: "button",
						onClick: () => setIsOrderModalOpen(true),
						className: "flex-1 rounded-full border border-white/40 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur-sm",
						children: "New order"
					})]
				})]
			}),
			/* @__PURE__ */ jsxs("section", {
				className: "grid gap-3 sm:grid-cols-2",
				children: [/* @__PURE__ */ jsxs("div", {
					className: "rounded-[22px] border border-violet-100 bg-white p-4 shadow-sm shadow-violet-50",
					children: [
						/* @__PURE__ */ jsx("p", {
							className: "text-[10px] uppercase tracking-[0.22em] text-slate-400",
							children: "Plan"
						}),
						/* @__PURE__ */ jsx("p", {
							className: "mt-3 text-lg font-bold text-slate-900",
							children: "Weekly Plus"
						}),
						/* @__PURE__ */ jsx("p", {
							className: "mt-1 text-sm text-slate-500",
							children: "4 bags remaining"
						})
					]
				}), /* @__PURE__ */ jsxs("div", {
					className: "rounded-[22px] border border-violet-100 bg-white p-4 shadow-sm shadow-violet-50",
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
				})]
			}),
			/* @__PURE__ */ jsxs("section", {
				className: "rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm shadow-slate-100 sm:p-5",
				children: [/* @__PURE__ */ jsxs("div", {
					className: "flex items-center justify-between",
					children: [/* @__PURE__ */ jsx("h3", {
						className: "text-lg font-bold text-slate-900",
						children: "New order"
					}), /* @__PURE__ */ jsx("button", {
						type: "button",
						onClick: () => setIsOrderModalOpen(true),
						className: "rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700",
						children: "Start"
					})]
				}), /* @__PURE__ */ jsxs("div", {
					className: "mt-4 flex flex-col gap-4 rounded-2xl bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between",
					children: [/* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("p", {
						className: "font-semibold text-slate-900",
						children: "Ready for a fresh start?"
					}), /* @__PURE__ */ jsx("p", {
						className: "mt-1 text-sm text-slate-500",
						children: "Choose a service and tell us how many clothes you have."
					})] }), /* @__PURE__ */ jsx("button", {
						type: "button",
						onClick: () => setIsOrderModalOpen(true),
						className: "shrink-0 rounded-2xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-violet-200",
						children: "Create order"
					})]
				})]
			}),
			/* @__PURE__ */ jsxs("section", {
				className: "rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm shadow-slate-100",
				children: [/* @__PURE__ */ jsxs("div", {
					className: "mb-3 flex items-center justify-between",
					children: [/* @__PURE__ */ jsx("h3", {
						className: "text-lg font-bold text-slate-900",
						children: "Recent orders"
					}), /* @__PURE__ */ jsx("button", {
						type: "button",
						className: "text-sm font-medium text-violet-600",
						children: "View all"
					})]
				}), /* @__PURE__ */ jsx("div", {
					className: "space-y-3",
					children: recentOrders.map((order) => /* @__PURE__ */ jsxs("div", {
						className: "flex items-center justify-between rounded-2xl bg-slate-50 p-3",
						children: [/* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("p", {
							className: "font-semibold text-slate-900",
							children: order.id
						}), /* @__PURE__ */ jsx("p", {
							className: "text-xs text-slate-500",
							children: order.date
						})] }), /* @__PURE__ */ jsxs("div", {
							className: "text-right",
							children: [/* @__PURE__ */ jsx("p", {
								className: "font-semibold text-slate-900",
								children: order.total
							}), /* @__PURE__ */ jsx("p", {
								className: "text-[11px] font-medium text-emerald-600",
								children: order.status
							})]
						})]
					}, order.id))
				})]
			}),
			isOrderModalOpen && /* @__PURE__ */ jsx(NewOrder, { onClose: () => setIsOrderModalOpen(false) })
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
				children: [/* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("p", {
					className: "text-sm font-medium text-violet-600",
					children: "Money movement"
				}), /* @__PURE__ */ jsx("h2", {
					className: "mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl",
					children: "Transactions"
				})] }), /* @__PURE__ */ jsx("p", {
					className: "text-sm text-slate-500",
					children: "Your wallet activity"
				})]
			}),
			/* @__PURE__ */ jsxs("section", {
				className: "relative overflow-hidden rounded-[28px] bg-gradient-to-br from-slate-950 via-violet-950 to-violet-700 p-5 text-white shadow-lg shadow-violet-200 sm:p-6",
				children: [/* @__PURE__ */ jsx("div", { className: "absolute -right-10 -top-12 h-40 w-40 rounded-full border-[22px] border-white/10" }), /* @__PURE__ */ jsxs("div", {
					className: "relative",
					children: [
						/* @__PURE__ */ jsxs("div", {
							className: "flex items-start justify-between gap-4",
							children: [/* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("p", {
								className: "text-xs font-medium uppercase tracking-[0.18em] text-violet-200",
								children: "Available balance"
							}), /* @__PURE__ */ jsx("p", {
								className: "mt-3 text-3xl font-bold tracking-tight sm:text-4xl",
								children: "₦18,750"
							})] }), /* @__PURE__ */ jsx("span", {
								className: "flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 text-lg backdrop-blur-sm",
								children: "◈"
							})]
						}),
						/* @__PURE__ */ jsxs("div", {
							className: "mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-violet-100",
							children: [/* @__PURE__ */ jsxs("span", { children: ["Added this month ", /* @__PURE__ */ jsx("strong", {
								className: "ml-1 text-white",
								children: "₦25,000"
							})] }), /* @__PURE__ */ jsxs("span", { children: ["Spent ", /* @__PURE__ */ jsx("strong", {
								className: "ml-1 text-white",
								children: "₦12,000"
							})] })]
						}),
						/* @__PURE__ */ jsx("button", {
							type: "button",
							className: "mt-5 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-violet-700 shadow-sm transition hover:bg-violet-50",
							children: "Top up balance"
						})
					]
				})]
			}),
			/* @__PURE__ */ jsx("section", {
				className: "rounded-[26px] border border-slate-200 bg-white p-3 shadow-sm shadow-slate-100 sm:p-4",
				children: /* @__PURE__ */ jsx("div", {
					className: "flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
					children: filterItems.map((item, index) => /* @__PURE__ */ jsx("button", {
						type: "button",
						className: `shrink-0 rounded-full px-4 py-2 text-sm font-medium transition ${index === 0 ? "bg-violet-600 text-white shadow-sm shadow-violet-200" : "bg-slate-50 text-slate-500 hover:bg-violet-50 hover:text-violet-700"}`,
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
						className: "hidden rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:border-violet-200 hover:text-violet-700 sm:block",
						children: "Export"
					})]
				}), /* @__PURE__ */ jsx("div", {
					className: "divide-y divide-slate-100",
					children: transactions.map((transaction) => /* @__PURE__ */ jsxs("div", {
						className: "flex items-center gap-3 py-4 first:pt-1 last:pb-1",
						children: [
							/* @__PURE__ */ jsx("span", {
								className: `flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-lg ${transaction.direction === "credit" ? "bg-emerald-50 text-emerald-600" : "bg-violet-50 text-violet-600"}`,
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
//#region src/portals/customer/pages/Login.tsx
var Login_exports$3 = /* @__PURE__ */ __exportAll({ default: () => Login_default$3 });
var Login_default$3 = UNSAFE_withComponentProps(function Login() {
	return /* @__PURE__ */ jsx("div", {
		className: "flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(168,85,247,0.2),transparent_30%),linear-gradient(180deg,_#f8f5ff_0%,_#f9fafb)] px-4",
		children: /* @__PURE__ */ jsxs("div", {
			className: "w-full max-w-md rounded-[30px] border border-violet-100 bg-white/90 p-6 shadow-xl shadow-violet-100 backdrop-blur-xl",
			children: [
				/* @__PURE__ */ jsxs("div", {
					className: "mb-6 text-center",
					children: [/* @__PURE__ */ jsx("p", {
						className: "text-[10px] font-semibold uppercase tracking-[0.22em] text-violet-500",
						children: "Welcome"
					}), /* @__PURE__ */ jsx("h1", {
						className: "mt-2 text-3xl font-bold text-slate-900",
						children: "Sign in to Qaffy"
					})]
				}),
				/* @__PURE__ */ jsxs("div", {
					className: "space-y-3",
					children: [/* @__PURE__ */ jsxs("div", {
						className: "rounded-2xl border border-slate-200 bg-slate-50 p-3",
						children: [/* @__PURE__ */ jsx("label", {
							className: "mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-slate-500",
							children: "Full name"
						}), /* @__PURE__ */ jsx("input", {
							className: "w-full bg-transparent text-base text-slate-900 placeholder:text-slate-400",
							placeholder: "Aisha Bello"
						})]
					}), /* @__PURE__ */ jsxs("div", {
						className: "rounded-2xl border border-slate-200 bg-slate-50 p-3",
						children: [/* @__PURE__ */ jsx("label", {
							className: "mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-slate-500",
							children: "Phone number"
						}), /* @__PURE__ */ jsx("input", {
							className: "w-full bg-transparent text-base text-slate-900 placeholder:text-slate-400",
							placeholder: "0803 123 4567"
						})]
					})]
				}),
				/* @__PURE__ */ jsxs("button", {
					type: "button",
					className: "mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-violet-200",
					children: [/* @__PURE__ */ jsx("span", { children: "G" }), "Continue with Google"]
				})
			]
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
var stats = [{
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
		"module": "/assets/entry.client-D1aI1ZNp.js",
		"imports": ["/assets/jsx-runtime-qbrBKaAi.js"],
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
			"module": "/assets/root-BjUP3_FR.js",
			"imports": ["/assets/jsx-runtime-qbrBKaAi.js"],
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
			"hasLoader": false,
			"hasClientAction": false,
			"hasClientLoader": false,
			"hasClientMiddleware": false,
			"hasDefaultExport": true,
			"hasErrorBoundary": false,
			"module": "/assets/CustomerLayout-fliflX3U.js",
			"imports": ["/assets/jsx-runtime-qbrBKaAi.js"],
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
			"module": "/assets/Home-BQVN6H5D.js",
			"imports": ["/assets/jsx-runtime-qbrBKaAi.js"],
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
			"module": "/assets/Transactions-Dj3EPSlf.js",
			"imports": ["/assets/jsx-runtime-qbrBKaAi.js"],
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
			"module": "/assets/Login-DfH59ZXf.js",
			"imports": ["/assets/jsx-runtime-qbrBKaAi.js"],
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
			"module": "/assets/LogisticsLayout-DUOZDB0v.js",
			"imports": ["/assets/jsx-runtime-qbrBKaAi.js"],
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
			"module": "/assets/Home-BaiOV-Aj.js",
			"imports": ["/assets/jsx-runtime-qbrBKaAi.js"],
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
			"module": "/assets/Home-BaiOV-Aj.js",
			"imports": ["/assets/jsx-runtime-qbrBKaAi.js"],
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
			"module": "/assets/Login-B2zgNJ7-.js",
			"imports": ["/assets/jsx-runtime-qbrBKaAi.js"],
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
			"module": "/assets/VendorLayout-CdZ42TLK.js",
			"imports": ["/assets/jsx-runtime-qbrBKaAi.js"],
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
			"module": "/assets/Home-MtctH5Pa.js",
			"imports": ["/assets/jsx-runtime-qbrBKaAi.js"],
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
			"module": "/assets/Login-tB9n2pgj.js",
			"imports": ["/assets/jsx-runtime-qbrBKaAi.js"],
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
			"module": "/assets/AdminLayout-CNCQUPu6.js",
			"imports": ["/assets/jsx-runtime-qbrBKaAi.js"],
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
			"module": "/assets/Home-DocBlagg.js",
			"imports": ["/assets/jsx-runtime-qbrBKaAi.js"],
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
			"module": "/assets/Login-CIoMn1lM.js",
			"imports": ["/assets/jsx-runtime-qbrBKaAi.js"],
			"css": [],
			"clientActionModule": void 0,
			"clientLoaderModule": void 0,
			"clientMiddlewareModule": void 0,
			"hydrateFallbackModule": void 0
		}
	},
	"url": "/assets/manifest-948445b1.js",
	"version": "948445b1",
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
	"portals/customer/pages/Login": {
		id: "portals/customer/pages/Login",
		parentId: "root",
		path: "login",
		index: void 0,
		caseSensitive: void 0,
		module: Login_exports$3
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
		module: Home_exports$2
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
