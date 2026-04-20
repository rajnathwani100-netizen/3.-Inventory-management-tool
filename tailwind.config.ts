import type { Config } from "tailwindcss";

const config: Config = {
    content: [
        "./pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./components/**/*.{js,ts,jsx,tsx,mdx}",
        "./app/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            colors: {
                brand: {
                    bg: "#FDF6EE",
                    heading: "#3B1D06",
                    text: "#3B1D06CC",
                    pink: "#EB2676",
                    hover: "#9A378A",
                    border: "#3B1D060F",
                    btn: "#FDE337",
                    btnHover: "#FF601B",
                    btnText: "#3B1D06",
                    shadow: "#3B1D06",
                },
            },
            fontFamily: {
                serif: ['"DM Serif Display"', "serif"],
                sans: ['"DM Sans"', "sans-serif"],
            },
            borderRadius: {
                xl: "1rem",
                "2xl": "1.5rem",
            },
        },
    },
    plugins: [],
};

export default config;
