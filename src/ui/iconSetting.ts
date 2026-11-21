import { App, ExtraButtonComponent, getIcon, setIcon, Setting } from "obsidian";
import { IconPickerModal } from "./iconPickerModal";
import { openModalInWindow } from "./modalWindow";

/**
 * The Icon row the Add/Edit item dialog and the macro editor share: the icon's picture and name,
 * a picker over Obsidian's icons, and a clear button. `onChange` gets the new id ("" for none);
 * the caller re-renders its form.
 */
export function renderIconSetting(
	app: App,
	containerEl: HTMLElement,
	icon: string,
	descriptions: { known: string; unknown: string },
	onChange: (icon: string) => void,
): Setting {
	const known = icon === "" || getIcon(icon) !== null;
	const setting = new Setting(containerEl).setName("Icon").setDesc(known ? descriptions.known : descriptions.unknown);
	const pictureEl = setting.controlEl.createSpan({ cls: "neokeys-entry-icon-picture" });
	if (icon !== "" && known) setIcon(pictureEl, icon);
	setting.controlEl.createSpan({ cls: "neokeys-entry-key-display", text: icon || "None" });
	setting.addButton((button) =>
		button.setButtonText(icon === "" ? "Choose icon..." : "Change icon...").onClick(() => {
			openModalInWindow(new IconPickerModal(app, onChange), containerEl.win);
		}),
	);
	if (icon !== "") {
		setting.addExtraButton((button: ExtraButtonComponent) =>
			button
				.setIcon("x")
				.setTooltip("Clear the icon")
				.onClick(() => onChange("")),
		);
	}
	return setting;
}
