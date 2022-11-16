const { app, BrowserWindow } = require('electron')
const { Client, Events, GatewayIntentBits, Collection } = require('discord.js')
const { joinVoiceChannel } = require('@discordjs/voice')
const express = require('express')
const path = require('path')
const fs = require('fs')
const { VerifyDiscordRequest } = require('./utils.js')

function createWindow () {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  })

  win.loadFile('index.html')
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

const client = new Client({ intents: [GatewayIntentBits.Guilds] })

client.commands = new Collection()

const commandsPath = path.join(__dirname, 'commands')
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'))

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file)
  const command = require(filePath)

  if ('data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command)
  } else {
    console.warn(`[WARNING] The command at ${filePath} is missing a require "data" or "execute" property.`)
  }
}

let voiceConnection

client.once(Events.ClientReady, async c => {
  console.log(`Ready!, Logged in as ${c.user.tag}`)

  // Fetch the guild channels
  const guild = await client.guilds.fetch(process.env.GUILD_ID)

  guild.channels.fetch()
    .then(channels => {
      for (const [, channel] of channels) {
        console.log('CHANNEL', Object.keys(channel))
        if (channel.type === 2) {
          voiceConnection = joinVoiceChannel({
            channelId: channel.id,
            guildId: channel.guild.id,
            adapterCreator: channel.guild.voiceAdapterCreator
          })
          return voiceConnection
        }
      }
    })
    .then(data => console.log(data))
})

client.on(Events.InteractionCreate, async interaction => {
  const command = interaction.client.commands.get(interaction.commandName)

  if (!command) {
    console.error(`No command matching ${interaction.commandName} was found.`)
    return
  }

  try {
    await command.execute(interaction)
  } catch (error) {
    console.error(error)
    await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true })
  }
})

client.login(process.env.DISCORD_TOKEN)

const exp = express()
const PORT = process.env.PORT || 3000
exp.use(express.json({ verify: VerifyDiscordRequest(process.env.PUBLIC_KEY) }))

exp.listen(PORT, () => {
  console.log('Listening on port', PORT)
})
