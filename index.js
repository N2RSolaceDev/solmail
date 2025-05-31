import {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    PermissionFlagsBits,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder
} from 'discord.js';

// Bot setup
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildMembers
    ]
});

// Role IDs
const COMMUNITY_ROLE_ID = '1346580732826619934'; // Community role
const MODERATOR_ROLE_ID = '1362974587360641226'; // Moderator role
const ADMIN_ROLE_ID = '1346580108739215453'; // Admin role (highest available role)
const BOT_DEVELOPER_ROLE_ID = '1362972277804765264'; // Bot Developer role

// Channel IDs
const WELCOME_CHANNEL_ID = '1362971897486250085'; // Welcome channel
const SUPPORT_CHANNEL_ID = '1362971895716249651'; // Support channel
const MODMAIL_CATEGORY_ID = '1362971873482248322'; // Modmail category
const STAFF_APPLICATION_REVIEW_CHANNEL_ID = '1362971905572733080'; // Application review channel

// Allowed roles for modmail
const ALLOWED_ROLE_IDS = [
    '1346580108739215453', // Admin role
    '1362974587360641226'  // Moderator role
];

const modmailChannels = {}; // Dictionary to store ongoing modmail channels
let supportPanelMessageId = null;

// When the bot is ready
client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);
    // Update or send the support panel
    const supportChannel = client.channels.cache.get(SUPPORT_CHANNEL_ID);
    if (supportChannel && supportChannel.isTextBased()) {
        const embed = new EmbedBuilder()
            .setTitle('Support Ticket')
            .setDescription('Select an option below.')
            .setColor('#0099ff');
        const selectMenu = new ActionRowBuilder()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('ticket_options')
                    .setPlaceholder('Choose an option...')
                    .addOptions(
                        new StringSelectMenuOptionBuilder()
                            .setLabel('General Support')
                            .setDescription('Start a general support ticket.')
                            .setValue('general_support'),
                        new StringSelectMenuOptionBuilder()
                            .setLabel('Staff Application')
                            .setDescription('Apply for a staff position.')
                            .setValue('staff_application'),
                        new StringSelectMenuOptionBuilder()
                            .setLabel('Bot Developer Application')
                            .setDescription('Apply for a bot developer position.')
                            .setValue('bot_developer_application')
                    )
            );
        // Fetch the last message in the channel
        const messages = await supportChannel.messages.fetch({ limit: 1 });
        const lastMessage = messages.first();
        if (lastMessage && lastMessage.author.id === client.user.id && lastMessage.embeds.length > 0) {
            // Update the existing message
            await lastMessage.edit({ embeds: [embed], components: [selectMenu] });
            supportPanelMessageId = lastMessage.id;
        } else {
            // Send a new message
            const sentMessage = await supportChannel.send({ embeds: [embed], components: [selectMenu] });
            supportPanelMessageId = sentMessage.id;
        }
    }
});

// Handle guild member add event
client.on('guildMemberAdd', async (member) => {
    // Assign the community role
    const communityRole = member.guild.roles.cache.get(COMMUNITY_ROLE_ID);
    if (communityRole) {
        try {
            await member.roles.add(communityRole);
        } catch (error) {
            console.error('Failed to assign role:', error);
        }
    }
    // Send a welcome message in the welcome channel
    const welcomeChannel = member.guild.channels.cache.get(WELCOME_CHANNEL_ID);
    if (welcomeChannel && welcomeChannel.isTextBased()) {
        const welcomeEmbed = new EmbedBuilder()
            .setTitle('Welcome to SolBots Community/Support Server!')
            .setDescription(`Hey ${member}, welcome to the server!`) // Mention the user here
            .setImage(member.user.displayAvatarURL({ size: 1024, dynamic: true }))
            .setColor('#00FF00');
        await welcomeChannel.send({ embeds: [welcomeEmbed] });
    }
});

// Handle interactions (dropdown and buttons)
client.on('interactionCreate', async interaction => {
    if (!interaction.isStringSelectMenu() && !interaction.isButton()) return;
    if (interaction.customId === 'ticket_options') {
        const selectedValue = interaction.values[0];
        if (selectedValue === 'general_support') {
            handleGeneralSupport(interaction);
        } else if (selectedValue === 'staff_application') {
            handleStaffApplication(interaction);
        } else if (selectedValue === 'bot_developer_application') {
            handleBotDeveloperApplication(interaction);
        }
    } else if (interaction.customId.startsWith('accept_')) {
        handleAccept(interaction);
    } else if (interaction.customId.startsWith('deny_')) {
        handleDeny(interaction);
    } else if (interaction.customId === 'close_ticket') {
        handleCloseTicket(interaction);
    }
});

// General Support Ticket
async function handleGeneralSupport(interaction) {
    const user = interaction.user;
    if (modmailChannels[user.id]) {
        return interaction.reply({
            embeds: [new EmbedBuilder()
                .setTitle('Error')
                .setDescription('You already have an open ticket.')
                .setColor('#FF0000')],
            ephemeral: true
        });
    }
    const guild = interaction.guild;
    const category = guild.channels.cache.get(MODMAIL_CATEGORY_ID);
    if (!category) {
        return interaction.reply({
            embeds: [new EmbedBuilder()
                .setTitle('Error')
                .setDescription('The Mod-mail category could not be found.')
                .setColor('#FF0000')],
            ephemeral: true
        });
    }
    try {
        const channel = await guild.channels.create({
            name: `ticket-${user.username}`,
            type: ChannelType.GuildText,
            parent: category,
            permissionOverwrites: [
                {
                    id: user.id,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
                },
                {
                    id: guild.roles.everyone.id,
                    deny: [PermissionFlagsBits.ViewChannel]
                },
                ...ALLOWED_ROLE_IDS.map(roleId => ({
                    id: roleId,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
                }))
            ],
            reason: `Mod Mail channel for ${user.username}`
        });
        modmailChannels[user.id] = channel.id;
        await interaction.reply({
            embeds: [new EmbedBuilder()
                .setTitle('Ticket Created')
                .setDescription(`Your support ticket has been created! Please check ${channel}.`)
                .setColor('#00FF00')],
            ephemeral: true
        });
        const closeButton = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('close_ticket')
                    .setLabel('Close Support')
                    .setStyle(ButtonStyle.Danger)
            );
        await channel.send({
            embeds: [new EmbedBuilder()
                .setTitle('New ModMail Ticket')
                .setDescription(`New ModMail ticket started by ${user} (${user.id}).`)
                .setColor('#0099ff')],
            components: [closeButton]
        });
    } catch (error) {
        console.error('Failed to create support ticket:', error);
        await interaction.reply({
            embeds: [new EmbedBuilder()
                .setTitle('Error')
                .setDescription('Failed to create the support ticket. Please try again later.')
                .setColor('#FF0000')],
            ephemeral: true
        });
    }
}

// Staff Application
async function handleStaffApplication(interaction) {
    const user = interaction.user;
    if (modmailChannels[user.id]) {
        return interaction.reply({
            embeds: [new EmbedBuilder()
                .setTitle('Error')
                .setDescription('You already have an open ticket.')
                .setColor('#FF0000')],
            ephemeral: true
        });
    }
    const guild = interaction.guild;
    const category = guild.channels.cache.get(MODMAIL_CATEGORY_ID);
    if (!category) {
        return interaction.reply({
            embeds: [new EmbedBuilder()
                .setTitle('Error')
                .setDescription('The Mod-mail category could not be found.')
                .setColor('#FF0000')],
            ephemeral: true
        });
    }
    const member = guild.members.cache.get(user.id);
    let roleType = getEligibleRole(member);
    if (!roleType) {
        return interaction.reply({
            embeds: [new EmbedBuilder()
                .setTitle('Error')
                .setDescription('You are not eligible to apply for any role.')
                .setColor('#FF0000')],
            ephemeral: true
        });
    }
    try {
        const channel = await guild.channels.create({
            name: `application-${user.username}`,
            type: ChannelType.GuildText,
            parent: category,
            permissionOverwrites: [
                {
                    id: user.id,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
                },
                {
                    id: guild.roles.everyone.id,
                    deny: [PermissionFlagsBits.ViewChannel]
                },
                ...ALLOWED_ROLE_IDS.map(roleId => ({
                    id: roleId,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
                }))
            ],
            reason: `Staff application channel for ${user.username}`
        });
        modmailChannels[user.id] = channel.id;
        await interaction.reply({
            embeds: [new EmbedBuilder()
                .setTitle('Application Started')
                .setDescription(`Your ${roleType} application has been started! Please check ${channel}.`)
                .setColor('#00FF00')],
            ephemeral: true
        });
        const questions = getQuestionsForRole(user, roleType);
        processApplication(channel, user, questions, roleType);
    } catch (error) {
        console.error('Failed to create staff application channel:', error);
        await interaction.reply({
            embeds: [new EmbedBuilder()
                .setTitle('Error')
                .setDescription('Failed to create the application channel. Please try again later.')
                .setColor('#FF0000')],
            ephemeral: true
        });
    }
}

// Bot Developer Application
async function handleBotDeveloperApplication(interaction) {
    const user = interaction.user;
    if (modmailChannels[user.id]) {
        return interaction.reply({
            embeds: [new EmbedBuilder()
                .setTitle('Error')
                .setDescription('You already have an open ticket.')
                .setColor('#FF0000')],
            ephemeral: true
        });
    }
    const guild = interaction.guild;
    const category = guild.channels.cache.get(MODMAIL_CATEGORY_ID);
    if (!category) {
        return interaction.reply({
            embeds: [new EmbedBuilder()
                .setTitle('Error')
                .setDescription('The Mod-mail category could not be found.')
                .setColor('#FF0000')],
            ephemeral: true
        });
    }
    try {
        const channel = await guild.channels.create({
            name: `application-${user.username}`,
            type: ChannelType.GuildText,
            parent: category,
            permissionOverwrites: [
                {
                    id: user.id,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
                },
                {
                    id: guild.roles.everyone.id,
                    deny: [PermissionFlagsBits.ViewChannel]
                },
                ...ALLOWED_ROLE_IDS.map(roleId => ({
                    id: roleId,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
                }))
            ],
            reason: `Bot developer application channel for ${user.username}`
        });
        modmailChannels[user.id] = channel.id;
        await interaction.reply({
            embeds: [new EmbedBuilder()
                .setTitle('Application Started')
                .setDescription(`Your bot developer application has been started! Please check ${channel}.`)
                .setColor('#00FF00')],
            ephemeral: true
        });
        const questions = getQuestionsForRole(user, 'bot_developer');
        processApplication(channel, user, questions, 'bot_developer');
    } catch (error) {
        console.error('Failed to create bot developer application channel:', error);
        await interaction.reply({
            embeds: [new EmbedBuilder()
                .setTitle('Error')
                .setDescription('Failed to create the application channel. Please try again later.')
                .setColor('#FF0000')],
            ephemeral: true
        });
    }
}

// Process Application
function processApplication(channel, user, questions, roleType) {
    let questionIndex = 0;
    const answers = [];
    const askQuestion = async () => {
        if (questionIndex < questions.length) {
            await channel.send({
                embeds: [new EmbedBuilder()
                    .setTitle('Application Question')
                    .setDescription(questions[questionIndex])
                    .setColor('#0099ff')]
            });
            questionIndex++;
        } else {
            await channel.send({
                embeds: [new EmbedBuilder()
                    .setTitle('Application Complete')
                    .setDescription('Thank you for completing the application! It will now be reviewed by staff.')
                    .setColor('#00FF00')]
            });
            const reviewChannel = client.channels.cache.get(STAFF_APPLICATION_REVIEW_CHANNEL_ID);
            if (reviewChannel && reviewChannel.isTextBased()) {
                const applicationEmbed = new EmbedBuilder()
                    .setTitle('New Application')
                    .setDescription(`**Applicant:** ${user} (${user.id})
**Role Type:** ${roleType}
**Answers:**
${answers.map((answer, index) => `**Q${index + 1}:** ${questions[index]}\n**A:** ${answer}`).join('\n\n')}`)
                    .setColor('#0099ff');
                const acceptButton = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`accept_${roleType}_${user.id}`)
                            .setLabel('Accept')
                            .setStyle(ButtonStyle.Success),
                        new ButtonBuilder()
                            .setCustomId(`deny_${roleType}_${user.id}`)
                            .setLabel('Deny')
                            .setStyle(ButtonStyle.Danger)
                    );
                await reviewChannel.send({
                    embeds: [applicationEmbed],
                    components: [acceptButton]
                });
            }
            delete modmailChannels[user.id];
            await channel.delete();
        }
    };
    channel.send({
        embeds: [new EmbedBuilder()
            .setTitle('Application Instructions')
            .setDescription('Please answer each question in the order they are asked. Once all questions are answered, your application will be submitted for review.')
            .setColor('#0099ff')]
    }).then(() => askQuestion());
    client.on('messageCreate', async message => {
        if (message.channel.id === channel.id && message.author.id === user.id) {
            answers.push(message.content);
            askQuestion();
        }
    });
}

// Get Questions Based on Role Type
function getQuestionsForRole(user, roleType) {
    switch (roleType) {
        case 'moderator':
            return [
                "1. Tell us about yourself.",
                "2. What is your previous moderation experience?",
                "3. How would you handle a situation where a user is spamming in chat?",
                "4. Why do you want to join our staff team?",
                "5. Describe a time when you resolved a conflict successfully.",
                "6. How much time can you dedicate to moderating the server?",
                "7. What qualities do you think make a good moderator?",
                "8. How would you handle a disagreement with another staff member?",
                "9. Provide an example of a difficult decision you had to make.",
                "10. How would you ensure consistency among the moderation team?"
            ];
        case 'admin':
            return [
                "1. What strategies would you use to manage server growth?",
                "2. How would you handle a major server crisis?",
                "3. Describe your experience with server management tools.",
                "4. What steps would you take to foster a positive community?",
                "5. How would you balance fairness and strictness in moderation?",
                "6. What measures would you take to prevent server toxicity?",
                "7. How would you train new moderators?",
                "8. What leadership qualities do you possess?",
                "9. How would you oversee the entire moderation team?",
                "10. What is your vision for the future of this server?"
            ];
        case 'bot_developer':
            return [
                "1. What programming languages are you proficient in? Please provide examples of projects you've worked on.",
                "2. Have you contributed to open-source projects or collaborated with others on development? If so, please describe.",
                "3. How would you handle bugs or issues in your bot? Provide an example of a bug you fixed.",
                "4. Why do you want to develop bots for SolBots specifically?",
                "5. Describe your experience with APIs and webhooks. Have you integrated third-party services into your bots?",
                "6. How would you ensure your bot is secure and reliable? What steps do you take to prevent vulnerabilities?",
                "7. What steps would you take to optimize bot performance? Have you worked on performance optimization before?",
                "8. How would you handle feature requests from the community? Provide an example of implementing a requested feature.",
                "9. Describe a time when you had to debug a complex issue. Walk us through your process.",
                "10. What measures would you take to ensure your bot is user-friendly and accessible?",
                "11. How would you handle a situation where your bot causes unintended consequences? Provide an example.",
                "12. What steps would you take to maintain and update your bot regularly? How do you stay up-to-date with changes?",
                "13. How would you collaborate with other developers or staff members? Describe your teamwork approach.",
                "14. Describe your experience with version control systems like Git. Have you used GitHub or GitLab?",
                "15. What steps would you take to document your bot's functionality? Why is documentation important?",
                "16. How would you handle feedback or criticism about your bot? Provide an example of addressing feedback.",
                "17. What is your approach to testing and quality assurance? Do you write unit tests or integration tests?",
                "18. How would you ensure your bot integrates seamlessly with the server? Describe your integration strategy.",
                "19. What is your vision for the future of bots in this server? How would you improve SolBots?",
                "20. How would you handle a situation where your bot is misused by users? Provide an example of mitigating misuse."
            ];
        default:
            return [];
    }
}

// Accept Application
async function handleAccept(interaction) {
    const match = interaction.customId.match(/^accept_(.+?)_(\d{17,19})$/);
    if (!match) {
        return interaction.reply({
            embeds: [new EmbedBuilder()
                .setTitle('Error')
                .setDescription('Invalid interaction data.')
                .setColor('#FF0000')],
            ephemeral: true
        });
    }
    const [, roleType, userId] = match;
    const user = await client.users.fetch(userId);
    const member = interaction.guild.members.cache.get(userId);
    if (!member) {
        return interaction.reply({
            embeds: [new EmbedBuilder()
                .setTitle('Error')
                .setDescription('Could not find the user in the server.')
                .setColor('#FF0000')],
            ephemeral: true
        });
    }
    let roleId;
    switch (roleType) {
        case 'moderator': roleId = MODERATOR_ROLE_ID; break;
        case 'admin': roleId = ADMIN_ROLE_ID; break;
        case 'bot_developer': roleId = BOT_DEVELOPER_ROLE_ID; break;
        default:
            return interaction.reply({
                embeds: [new EmbedBuilder()
                    .setTitle('Error')
                    .setDescription('Invalid role type.')
                    .setColor('#FF0000')],
                ephemeral: true
            });
    }
    try {
        await member.roles.add(roleId);
        await interaction.reply({
            embeds: [new EmbedBuilder()
                .setTitle('Application Accepted')
                .setDescription(`${user} has been accepted for the ${roleType} role.`)
                .setColor('#00FF00')],
            ephemeral: true
        });
        await user.send({
            embeds: [new EmbedBuilder()
                .setTitle('Congratulations!')
                .setDescription(`Your application for the ${roleType} role has been accepted!`)
                .setColor('#00FF00')]
        });
    } catch (error) {
        console.error('Failed to assign role:', error);
        await interaction.reply({
            embeds: [new EmbedBuilder()
                .setTitle('Error')
                .setDescription('Failed to assign the role. Please check the bot permissions.')
                .setColor('#FF0000')],
            ephemeral: true
        });
    }
}

// Deny Application
async function handleDeny(interaction) {
    const match = interaction.customId.match(/^deny_(.+?)_(\d{17,19})$/);
    if (!match) {
        return interaction.reply({
            embeds: [new EmbedBuilder()
                .setTitle('Error')
                .setDescription('Invalid interaction data.')
                .setColor('#FF0000')],
            ephemeral: true
        });
    }
    const [, roleType, userId] = match;
    const user = await client.users.fetch(userId);
    try {
        await interaction.reply({
            embeds: [new EmbedBuilder()
                .setTitle('Application Denied')
                .setDescription(`${user} has been denied for the ${roleType} role.`)
                .setColor('#FF0000')],
            ephemeral: true
        });
        await user.send({
            embeds: [new EmbedBuilder()
                .setTitle('Application Result')
                .setDescription(`We regret to inform you that your application for the ${roleType} role has been denied.`)
                .setColor('#FF0000')]
        });
    } catch (error) {
        console.error('Failed to send denial message:', error);
        await interaction.reply({
            embeds: [new EmbedBuilder()
                .setTitle('Error')
                .setDescription('Failed to send the denial message. Please check the bot permissions.')
                .setColor('#FF0000')],
            ephemeral: true
        });
    }
}

// Close Ticket
async function handleCloseTicket(interaction) {
    const channel = interaction.channel;
    try {
        await channel.send({
            embeds: [new EmbedBuilder()
                .setTitle('Ticket Closed')
                .setDescription('This ticket has been closed by a staff member.')
                .setColor('#FF0000')]
        });
        delete modmailChannels[channel.name.split('-')[1]]; // Remove from ongoing tickets
        await channel.delete();
    } catch (error) {
        console.error('Failed to close ticket:', error);
        await interaction.reply({
            embeds: [new EmbedBuilder()
                .setTitle('Error')
                .setDescription('Failed to close the ticket. Please check the bot permissions.')
                .setColor('#FF0000')],
            ephemeral: true
        });
    }
}

// Get Eligible Role Based on Hierarchy
function getEligibleRole(member) {
    if (member.roles.cache.has(ADMIN_ROLE_ID)) return null; // Highest role, no eligibility
    if (member.roles.cache.has(MODERATOR_ROLE_ID)) return 'admin';
    if (member.roles.cache.has(COMMUNITY_ROLE_ID)) return 'moderator';
    return null; // No eligible role
}

// Login the bot
client.login('MTM0MzI2NTQ0MzY5MDk3MTE4Nw.GVRZvx.B2uAuVR1U_UCYBFIAUhNrys3Fg4fFxUXYb9qTQ'); // Replace with your bot token