export interface LegacyPage {
	slug: string;
	title: string;
	section: string;
	archivePath: string;
	intro: string;
	kind?: 'listing' | 'calendar' | 'article';
}

export interface NavigationItem {
	title: string;
	slug: string;
	children?: { title: string; slug: string; depth?: number }[];
}

const site = 'https://www.reset.etsii.upm.es';
const capture = '20230428164918';

export const archiveUrl = (path: string) =>
	`https://web.archive.org/web/${capture}/${site}${path}`;

export const legacyPages: LegacyPage[] = [
	{ slug: 'cybertech/cybertech-2023', title: 'Cybertech 2023', section: 'Cybertech', archivePath: '/cybertech/cybertech-2023/', intro: 'Cybertech es la competición de robótica de la UPM, organizada por Reset en la ETSII. La edición de 2023 se celebró del 25 al 28 de abril en el pabellón de deportes.' },
	{ slug: 'cybertech/cybertech-2022', title: 'Cybertech 2022', section: 'Cybertech', archivePath: '/cybertech/cybertech-2022/', intro: 'Edición 2022 de Cybertech, la competición de robótica organizada por Reset.' },
	{ slug: 'cybertech/cybertech-2021', title: 'Cybertech 2021', section: 'Cybertech', archivePath: '/cybertech/cybertech-2021/', intro: 'Edición 2021 de Cybertech.' },
	{ slug: 'cybertech/cybertech2020', title: 'Cybertech 2020', section: 'Cybertech', archivePath: '/cybertech/cybertech2020/', intro: 'Edición 2020 de Cybertech.' },
	{ slug: 'cybertech/cybertech2019', title: 'Cybertech 2019', section: 'Cybertech', archivePath: '/cybertech/cybertech2019/', intro: 'Edición 2019 de Cybertech.' },
	{ slug: 'cybertech/cybertech2018', title: 'Cybertech 2018', section: 'Cybertech', archivePath: '/cybertech/cybertech2018/', intro: 'Edición 2018 de Cybertech.' },
	{ slug: 'cybertech/cybertech2017', title: 'Cybertech 2017', section: 'Cybertech', archivePath: '/cybertech/cybertech2017/', intro: 'Edición 2017 de Cybertech.' },
	{ slug: 'proyectos', title: 'Proyectos', section: 'Proyectos', archivePath: '/proyectos/', intro: 'Proyectos de robótica, electrónica, automática e informática desarrollados por miembros de Reset.', kind: 'listing' },
	{ slug: 'proyectos/nuevosproyectos', title: 'Nuevos proyectos', section: 'Proyectos', archivePath: '/proyectos/nuevosproyectos/', intro: 'Proyectos en desarrollo de la asociación.', kind: 'listing' },
	{ slug: 'proyectos/nuevosproyectos/rr-8', title: 'RR-8', section: 'Nuevos proyectos', archivePath: '/proyectos/nuevosproyectos/rr-8/', intro: 'Proyecto RR-8 de Reset.' },
	{ slug: 'proyectos/nuevosproyectos/reset-league', title: 'Reset League', section: 'Nuevos proyectos', archivePath: '/proyectos/nuevosproyectos/reset-league/', intro: 'Proyecto Reset League.' },
	{ slug: 'proyectos/nuevosproyectos/rhex', title: 'Rhex', section: 'Nuevos proyectos', archivePath: '/proyectos/nuevosproyectos/rhex/', intro: 'Proyecto Rhex de Reset.' },
	{ slug: 'proyectos/antiguos-proyectos', title: 'Antiguos proyectos', section: 'Proyectos', archivePath: '/proyectos/antiguos-proyectos/', intro: 'Archivo de proyectos realizados por la asociación.', kind: 'listing' },
	{ slug: 'proyectos/antiguos-proyectos/piano-gigante', title: 'Piano Gigante', section: 'Antiguos proyectos', archivePath: '/proyectos/antiguos-proyectos/piano-gigante/', intro: 'Piano interactivo de gran formato desarrollado por Reset para eventos de la ETSII.' },
	{ slug: 'proyectos/antiguos-proyectos/hoverboard', title: 'Hoverboard', section: 'Antiguos proyectos', archivePath: '/proyectos/antiguos-proyectos/hoverboard/', intro: 'Proyecto Hoverboard de Reset.' },
	{ slug: 'proyectos/antiguos-proyectos/espasmitos', title: 'Espasmitos', section: 'Antiguos proyectos', archivePath: '/proyectos/antiguos-proyectos/espasmitos/', intro: 'Proyecto Espasmitos de Reset.' },
	{ slug: 'proyectos/antiguos-proyectos/apophis', title: 'Apophis', section: 'Antiguos proyectos', archivePath: '/proyectos/antiguos-proyectos/apophis/', intro: 'Proyecto Apophis de Reset.' },
	{ slug: 'proyectos/antiguos-proyectos/bci', title: 'BCI', section: 'Antiguos proyectos', archivePath: '/proyectos/antiguos-proyectos/bci/', intro: 'Proyecto BCI de Reset.' },
	{ slug: 'proyectos/antiguos-proyectos/morphex', title: 'Morphex', section: 'Antiguos proyectos', archivePath: '/proyectos/antiguos-proyectos/morphex/', intro: 'Proyecto Morphex de Reset.' },
	{ slug: 'talleres', title: 'Talleres', section: 'Talleres', archivePath: '/talleres/', intro: 'Talleres formativos organizados por Reset.', kind: 'listing' },
	{ slug: 'talleres/octubre-robotico', title: 'Octubre Robótico', section: 'Talleres', archivePath: '/talleres/octubre-robotico/', intro: 'Actividades y talleres de robótica organizados durante Octubre Robótico.' },
	{ slug: 'talleres/programacion-en-c', title: 'Programación en C', section: 'Talleres', archivePath: '/talleres/programacion-en-c/', intro: 'Taller de introducción a la programación en C.' },
	{ slug: 'talleres/talleres-de-cybertech', title: 'Talleres de Cybertech', section: 'Talleres', archivePath: '/talleres/talleres-de-cybertech/', intro: 'Talleres de preparación para las pruebas de Cybertech.' },
	{ slug: 'servicios', title: 'Servicios', section: 'Servicios', archivePath: '/servicios/', intro: 'Servicios de Reset para el alumnado y personal de la ETSII.', kind: 'listing' },
	{ slug: 'servicios/impresion-3d', title: 'Impresión 3D', section: 'Servicios', archivePath: '/servicios/impresion-3d/', intro: 'Servicio limitado para alumnado y personal de la ETSII (UPM).' },
	{ slug: 'servicios/taller', title: 'Taller / Workshop', section: 'Servicios', archivePath: '/servicios/taller/', intro: 'Espacio de trabajo de Reset y alumnos de Robótica.' },
	{ slug: 'servicios/prestamos', title: 'Préstamos', section: 'Servicios', archivePath: '/servicios/prestamos/', intro: 'Servicio de préstamo de herramientas para la comunidad de la ETSII.' },
	{ slug: 'servicios/tutoriales', title: 'Tutoriales Web', section: 'Servicios', archivePath: '/servicios/tutoriales/', intro: 'Tutoriales y recursos formativos publicados por Reset.' },
	{ slug: 'calendario', title: 'Próximos Eventos', section: 'Calendario', archivePath: '/calendario/', intro: 'Calendario de eventos y actividades de Reset.', kind: 'calendar' },
	{ slug: 'calendario/lista', title: 'Eventos en lista', section: 'Calendario', archivePath: '/calendario/lista/', intro: 'Vista de lista del calendario de eventos.', kind: 'calendar' },
	{ slug: 'calendario/mes', title: 'Eventos del mes', section: 'Calendario', archivePath: '/calendario/mes/', intro: 'Vista mensual del calendario de eventos.', kind: 'calendar' },
	{ slug: 'calendario/hoy', title: 'Eventos de hoy', section: 'Calendario', archivePath: '/calendario/hoy/', intro: 'Vista diaria del calendario de eventos.', kind: 'calendar' },
	{ slug: 'contacto/miembros-22-23', title: 'Miembros 22/23', section: 'Conócenos', archivePath: '/contacto/miembros-22-23/', intro: 'Equipo de Reset durante el curso 2022/23.' },
	{ slug: 'contacto/miembros-21-22', title: 'Miembros 21/22', section: 'Conócenos', archivePath: '/contacto/miembros-21-22/', intro: 'Equipo de Reset durante el curso 2021/22.' },
	{ slug: 'contacto/miembros-20-21', title: 'Miembros 20/21', section: 'Conócenos', archivePath: '/contacto/miembros-20-21/', intro: 'Equipo de Reset durante el curso 2020/21.' },
	{ slug: 'colaboradores', title: 'Colaboradores', section: 'Conócenos', archivePath: '/colaboradores/', intro: 'Entidades y personas que colaboran con Reset.' },
	{ slug: 'contacto', title: 'Contacto', section: 'Conócenos', archivePath: '/contacto/', intro: 'Contacta con la Asociación de Estudiantes Reset de la ETSII-UPM.' },
	{ slug: 'participa-en-reset', title: 'Participa en Reset', section: 'Conócenos', archivePath: '/participa-en-reset/', intro: 'Únete a Reset y participa en sus proyectos y actividades.' },
	{ slug: 'vuelve-cybertech-y-este-ano-con-mas-fuerza-que-nunca', title: '¡¡¡Vuelve CYBERTECH, y este año con MÁS FUERZA QUE NUNCA!!!', section: 'Noticias', archivePath: '/vuelve-cybertech-y-este-ano-con-mas-fuerza-que-nunca/', intro: 'Tras un largo año de semipresencialidad, volvemos a la actividad y también lo hace Cybertech, con categorías Classic, Sumo y Pro.', kind: 'article' },
	{ slug: 'octubre-robotico-2021', title: 'Octubre Robótico 2021', section: 'Noticias', archivePath: '/octubre-robotico-2021/', intro: 'Los días 27 y 29 de octubre tuvieron lugar los talleres de Octubre Robótico, con una introducción a Arduino.', kind: 'article' },
	{ slug: 'profesores-y-estudiantes-de-la-upm-imprimen-material-sanitario-en-3d-para-el-hospital-general-universitario-gregorio-maranon', title: 'Profesores y estudiantes de la UPM imprimen material sanitario en 3D para el Hospital General Universitario Gregorio Marañón', section: 'Noticias', archivePath: '/profesores-y-estudiantes-de-la-upm-imprimen-material-sanitario-en-3d-para-el-hospital-general-universitario-gregorio-maranon/', intro: 'Profesores, estudiantes y antiguos alumnos de la UPM colaboraron en la fabricación de material sanitario durante la crisis del COVID-19.', kind: 'article' },
	{ slug: 'aula-2020', title: 'Aula 2020', section: 'Noticias', archivePath: '/aula-2020/', intro: 'Reset participó en AULA 2020, la feria de estudiantes celebrada en IFEMA.', kind: 'article' },
];

export const navigation = [
	{ title: 'Noticias', slug: 'noticias' },
	{
		title: 'Cybertech', slug: 'cybertech/cybertech-2023', children: [
			{ title: 'Cybertech 2023', slug: 'cybertech/cybertech-2023' },
			{ title: 'Cybertech 2022', slug: 'cybertech/cybertech-2022' },
			{ title: 'Cybertech 2021', slug: 'cybertech/cybertech-2021' },
			{ title: 'Cybertech 2020', slug: 'cybertech/cybertech2020' },
			{ title: 'Cybertech 2019', slug: 'cybertech/cybertech2019' },
			{ title: 'Cybertech 2018', slug: 'cybertech/cybertech2018' },
			{ title: 'Cybertech 2017', slug: 'cybertech/cybertech2017' },
		],
	},
	{
		title: 'Proyectos', slug: 'proyectos', children: [
			{ title: 'Nuevos proyectos', slug: 'proyectos/nuevosproyectos' },
			{ title: 'RR-8', slug: 'proyectos/nuevosproyectos/rr-8', depth: 2 },
			{ title: 'Reset League', slug: 'proyectos/nuevosproyectos/reset-league', depth: 2 },
			{ title: 'Rhex', slug: 'proyectos/nuevosproyectos/rhex', depth: 2 },
			{ title: 'Antiguos proyectos', slug: 'proyectos/antiguos-proyectos' },
			{ title: 'Piano Gigante', slug: 'proyectos/antiguos-proyectos/piano-gigante', depth: 2 },
			{ title: 'Rhex', slug: 'proyectos/nuevosproyectos/rhex', depth: 2 },
			{ title: 'Hoverboard', slug: 'proyectos/antiguos-proyectos/hoverboard', depth: 2 },
			{ title: 'Espasmitos', slug: 'proyectos/antiguos-proyectos/espasmitos', depth: 2 },
			{ title: 'Apophis', slug: 'proyectos/antiguos-proyectos/apophis', depth: 2 },
			{ title: 'BCI', slug: 'proyectos/antiguos-proyectos/bci', depth: 2 },
			{ title: 'Morphex', slug: 'proyectos/antiguos-proyectos/morphex', depth: 2 },
		],
	},
	{
		title: 'Talleres', slug: 'talleres', children: [
			{ title: 'Octubre Robótico', slug: 'talleres/octubre-robotico' },
			{ title: 'Programación en C', slug: 'talleres/programacion-en-c' },
			{ title: 'Talleres de Cybertech', slug: 'talleres/talleres-de-cybertech' },
		],
	},
	{
		title: 'Servicios', slug: 'servicios', children: [
			{ title: 'Impresión 3D', slug: 'servicios/impresion-3d' },
			{ title: 'Taller / Workshop', slug: 'servicios/taller' },
			{ title: 'Préstamos', slug: 'servicios/prestamos' },
			{ title: 'Tutoriales Web', slug: 'servicios/tutoriales' },
		],
	},
	{ title: 'Calendario', slug: 'calendario' },
	{
		title: 'Conócenos', slug: 'contacto', children: [
			{ title: 'Miembros 22/23', slug: 'contacto/miembros-22-23' },
			{ title: 'Miembros 21/22', slug: 'contacto/miembros-21-22' },
			{ title: 'Miembros 20/21', slug: 'contacto/miembros-20-21' },
			{ title: 'Colaboradores', slug: 'colaboradores' },
			{ title: 'Contacto', slug: 'contacto' },
			{ title: 'Participa en Reset', slug: 'participa-en-reset' },
		],
	},
];

export const pathFor = (slug: string, base = import.meta.env.BASE_URL) =>
	`${base.replace(/\/$/, '')}/${slug}`;