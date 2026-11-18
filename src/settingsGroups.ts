/**
 * Which groups of the settings tab apply on this device, kept free of Obsidian imports so the
 * decision is unit-tested. The settings tab asks it for each group before building it.
 *
 * Obsidian's mobile apps have no hotkeys: nothing can be bound to the "Neokeys: Leader" command
 * and there is no keyboard to type a combo on, so the whole "Leader key" group (the hotkey
 * pointer, the combo leader and its conflict check) is hidden on phones and tablets. The dial,
 * the other way round, only exists on phones and tablets, so its group is hidden on desktop.
 * Hiding a setting never changes what the setting does or the value it holds: the leader combo
 * stays registered if one was set on another device and synced, and the dial settings keep
 * their saved values so they still apply on a phone or tablet the settings sync to.
 */
export type SettingsGroupId = "leader" | "popup" | "dial" | "macros" | "keymap";

const ALL_GROUPS: readonly SettingsGroupId[] = ["leader", "popup", "dial", "macros", "keymap"];

/** The setting groups to show, in order, on a device that is (or is not) mobile. */
export function visibleSettingsGroups(isMobile: boolean): SettingsGroupId[] {
	return ALL_GROUPS.filter((group) => !(isMobile && group === "leader") && !(!isMobile && group === "dial"));
}
