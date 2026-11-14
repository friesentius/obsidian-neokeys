/**
 * Which groups of the settings tab apply on this device, kept free of Obsidian imports so the
 * decision is unit-tested. The settings tab asks it for each group before building it.
 *
 * Obsidian's mobile apps have no hotkeys: nothing can be bound to the "Neokeys: Leader" command
 * and there is no keyboard to type a combo on, so the whole "Leader key" group (the hotkey
 * pointer, the combo leader and its conflict check) is hidden on phones and tablets. The leader
 * combo stays registered if one was set on another device and synced: hiding a setting never
 * changes what the setting does. Desktop shows everything, as before.
 */
export type SettingsGroupId = "leader" | "popup" | "dial" | "keymap";

const ALL_GROUPS: readonly SettingsGroupId[] = ["leader", "popup", "dial", "keymap"];

/** The setting groups to show, in order, on a device that is (or is not) mobile. */
export function visibleSettingsGroups(isMobile: boolean): SettingsGroupId[] {
	return ALL_GROUPS.filter((group) => !(isMobile && group === "leader"));
}
