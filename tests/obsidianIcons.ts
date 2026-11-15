/**
 * The bare names of the Lucide icons that Obsidian 1.2.7 bundles (the oldest release published
 * at or after the manifest's minAppVersion, 1.2.3, whose icon set can be inspected; no 1.2.3 build
 * is published). Read out of that release's app.js, then checked against Obsidian 1.15.1's
 * getIconIds(): every name here is still there, apart from the brand icons Lucide dropped, which are
 * left out. A name in this list resolves with setIcon/getIcon on every supported Obsidian.
 */
export const OBSIDIAN_ICON_NAMES: ReadonlySet<string> = new Set(
	`
	accessibility activity airplay air-vent alarm-check alarm-clock alarm-clock-off alarm-minus alarm-plus album
	alert-circle alert-octagon alert-triangle align-center align-center-horizontal align-center-vertical
	align-end-horizontal align-end-vertical align-horizontal-distribute-center align-horizontal-distribute-end
	align-horizontal-distribute-start align-horizontal-justify-center align-horizontal-justify-end
	align-horizontal-justify-start align-horizontal-space-around align-horizontal-space-between align-justify
	align-left align-right align-start-horizontal align-start-vertical align-vertical-distribute-center
	align-vertical-distribute-end align-vertical-distribute-start align-vertical-justify-center
	align-vertical-justify-end align-vertical-justify-start align-vertical-space-around
	align-vertical-space-between anchor angry annoyed aperture apple archive archive-restore armchair
	arrow-big-down arrow-big-left arrow-big-right arrow-big-up arrow-down arrow-down-circle arrow-down-left
	arrow-down-left-from-circle arrow-down-right arrow-down-right-from-circle arrow-left arrow-left-circle
	arrow-left-right arrow-right arrow-right-circle arrow-up arrow-up-circle arrow-up-down arrow-up-left
	arrow-up-left-from-circle arrow-up-right arrow-up-right-from-circle asterisk atom at-sign award axe axis-3d
	baby backpack baggage-claim ban banana banknote bar-chart bar-chart-2 bar-chart-3 bar-chart-4
	bar-chart-horizontal baseline bath battery battery-charging battery-full battery-low battery-medium
	battery-warning beaker bean bean-off bed bed-double bed-single beef beer bell bell-minus bell-off bell-plus
	bell-ring bike binary bird bitcoin blinds bluetooth bluetooth-connected bluetooth-off bluetooth-searching
	bold bomb bone book book-copy book-down book-key book-lock bookmark book-marked bookmark-minus bookmark-plus
	book-minus book-open book-open-check book-plus book-template book-up book-x bot box boxes box-select brain
	brain-circuit brain-cog briefcase brush bug building building-2 bus cake calculator calendar calendar-check
	calendar-check-2 calendar-clock calendar-days calendar-heart calendar-minus calendar-off calendar-plus
	calendar-range calendar-search calendar-x calendar-x2 camera camera-off candy candy-off car carrot
	case-lower case-sensitive case-upper cast castle cat check check-check check-circle check-circle-2
	check-square chef-hat cherry chevron-down chevron-down-square chevron-first chevron-last chevron-left
	chevron-left-square chevron-right chevron-right-square chevrons-down chevrons-down-up chevrons-left
	chevrons-left-right chevrons-right chevrons-right-left chevrons-up chevrons-up-down chevron-up
	chevron-up-square church cigarette cigarette-off circle circle-dot circle-ellipsis circle-equal circle-off
	circle-slash circle-slash-2 circuit-board citrus clapperboard clipboard clipboard-check clipboard-copy
	clipboard-edit clipboard-list clipboard-paste clipboard-signature clipboard-type clipboard-x clock clock-1
	clock-10 clock-11 clock-12 clock-2 clock-3 clock-4 clock-5 clock-6 clock-7 clock-8 clock-9 cloud cloud-cog
	cloud-drizzle cloud-fog cloud-hail cloud-lightning cloud-moon cloud-moon-rain cloud-off cloud-rain
	cloud-rain-wind cloud-snow cloud-sun cloud-sun-rain cloudy clover code code-2 coffee cog coins columns
	command compass component concierge-bell construction contact contrast cookie copy copy-check copyleft
	copy-minus copy-plus copyright copy-slash copy-x corner-down-left corner-down-right corner-left-down
	corner-left-up corner-right-down corner-right-up corner-up-left corner-up-right cpu creative-commons
	credit-card croissant crop cross crosshair crown cup-soda curly-braces currency database database-backup
	delete diamond dice-1 dice-2 dice-3 dice-4 dice-5 dice-6 dices diff disc disc-2 divide divide-circle
	divide-square dna dna-off dog dollar-sign door-closed door-open download download-cloud droplet droplets
	drumstick dumbbell ear ear-off edit edit-2 edit-3 egg egg-fried egg-off equal equal-not eraser euro expand
	external-link eye eye-off factory fan fast-forward feather file file-archive file-audio file-audio-2
	file-axis-3d file-badge file-badge-2 file-bar-chart file-bar-chart-2 file-box file-check file-check-2
	file-clock file-code file-cog file-cog-2 file-diff file-digit file-down file-edit file-heart file-image
	file-input file-json file-json-2 file-key file-key-2 file-line-chart file-lock file-lock-2 file-minus
	file-minus-2 file-output file-pie-chart file-plus file-plus-2 file-question files file-scan file-search
	file-search-2 file-signature file-spreadsheet file-symlink file-terminal file-text file-type file-type-2
	file-up file-video file-video-2 file-volume file-volume-2 file-warning file-x file-x2 film filter filter-x
	fingerprint fish fish-off flag flag-off flag-triangle-left flag-triangle-right flame flashlight
	flashlight-off flask-conical flask-conical-off flask-round flip-horizontal flip-horizontal-2 flip-vertical
	flip-vertical-2 flower flower-2 focus folder folder-archive folder-check folder-clock folder-closed
	folder-cog folder-cog-2 folder-down folder-edit folder-git folder-git-2 folder-heart folder-input folder-key
	folder-lock folder-minus folder-open folder-output folder-plus folders folder-search folder-search-2
	folder-symlink folder-tree folder-up folder-x footprints forklift form-input forward frame frown fuel
	function-square gamepad gamepad-2 gauge gavel gem ghost gift git-branch git-branch-plus git-commit
	git-compare git-fork github git-merge git-pull-request git-pull-request-closed git-pull-request-draft
	glasses glass-water globe globe-2 grab graduation-cap grape grid grip grip-horizontal grip-vertical hammer
	hand hand-metal hard-drive hard-hat hash haze heading heading-1 heading-2 heading-3 heading-4 heading-5
	heading-6 headphones heart heart-crack heart-handshake heart-off heart-pulse help-circle helping-hand
	hexagon highlighter history home hop hop-off hotel hourglass ice-cream ice-cream-2 image image-minus
	image-off image-plus import inbox indent indian-rupee infinity info inspect italic japanese-yen joystick key
	keyboard lamp lamp-ceiling lamp-desk lamp-floor lamp-wall-down lamp-wall-up landmark languages laptop
	laptop-2 lasso lasso-select laugh layers layout layout-dashboard layout-grid layout-list layout-template
	leaf library life-buoy lightbulb lightbulb-off line-chart link link-2 link-2off list list-checks list-end
	list-minus list-music list-ordered list-plus list-start list-tree list-video list-x loader loader-2 locate
	locate-fixed locate-off lock log-in log-out luggage magnet mail mailbox mail-check mail-minus mail-open
	mail-plus mail-question mails mail-search mail-warning mail-x map map-pin map-pin-off martini maximize
	maximize-2 medal megaphone megaphone-off meh menu message-circle message-square message-square-dashed
	message-square-plus messages-square mic mic-2 mic-off microscope microwave milestone milk milk-off minimize
	minimize-2 minus minus-circle minus-square monitor monitor-off monitor-smartphone monitor-speaker moon
	more-horizontal more-vertical mountain mountain-snow mouse mouse-pointer mouse-pointer-2 mouse-pointer-click
	move move-3d move-diagonal move-diagonal-2 move-horizontal move-vertical music music-2 music-3 music-4
	navigation navigation-2 navigation-2off navigation-off network newspaper nfc nut nut-off octagon option
	orbit outdent package package-2 package-check package-minus package-open package-plus package-search
	package-x paintbrush paintbrush-2 paint-bucket palette palmtree paperclip parking-circle parking-circle-off
	parking-square parking-square-off party-popper pause pause-circle pause-octagon pencil pen-tool percent
	person-standing phone phone-call phone-forwarded phone-incoming phone-missed phone-off phone-outgoing
	picture-in-picture picture-in-picture-2 pie-chart piggy-bank pilcrow pill pin pin-off pipette pizza plane
	plane-landing plane-takeoff play play-circle plug plug-2 plug-zap plus plus-circle plus-square podcast
	pointer pound-sterling power power-off printer puzzle qr-code quote radio radio-receiver radio-tower rat
	receipt rectangle-horizontal rectangle-vertical recycle redo redo-2 refresh-ccw refresh-cw refrigerator
	regex remove-formatting repeat repeat-1 replace replace-all reply reply-all rewind rocket rocking-chair
	rotate-3d rotate-ccw rotate-cw router rss ruler russian-ruble sailboat salad sandwich save scale scale-3d
	scaling scan scan-face scan-line school school-2 scissors screen-share screen-share-off scroll search send
	separator-horizontal separator-vertical server server-cog server-crash server-off settings settings-2 share
	share-2 sheet shield shield-alert shield-check shield-close shield-off shield-question ship shirt
	shopping-bag shopping-cart shovel shower-head shrink shrub shuffle sidebar sidebar-close sidebar-open sigma
	signal signal-high signal-low signal-medium signal-zero siren skip-back skip-forward skull slice sliders
	sliders-horizontal smartphone smartphone-charging smartphone-nfc smile smile-plus snowflake sofa sort-asc
	sort-desc soup space speaker spline split-square-horizontal split-square-vertical sprout square stamp star
	star-half star-off step-back step-forward stethoscope sticker sticky-note stop-circle store
	stretch-horizontal stretch-vertical strikethrough subscript subtitles sun sun-dim sun-medium sun-moon
	sunrise sunset sun-snow superscript swiss-franc switch-camera sword swords syringe table table-2 tablet
	tablets tag tags target tent terminal terminal-square test-tube test-tube-2 test-tubes text text-cursor
	text-cursor-input text-selection thermometer thermometer-snowflake thermometer-sun thumbs-down thumbs-up
	ticket timer timer-off timer-reset toggle-left toggle-right tornado tower-control toy-brick train trash
	trash-2 tree-deciduous tree-pine trees trending-down trending-up triangle trophy truck tv tv-2 type umbrella
	underline undo undo-2 unlink unlink-2 unlock upload upload-cloud usb user user-check user-cog user-minus
	user-plus users user-x utensils utensils-crossed utility-pole vegan venetian-mask verified vibrate
	vibrate-off video video-off view voicemail volume volume-1 volume-2 volume-x vote wallet wand wand-2
	warehouse watch waves webcam webhook wheat wheat-off whole-word wifi wifi-off wind wine wine-off wrap-text
	wrench x x-circle x-octagon x-square zap zap-off zoom-in zoom-out
`
		.split(/\s+/)
		.filter((name) => name.length > 0),
);
