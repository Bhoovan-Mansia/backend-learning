import mongoose, {isValidObjectId} from "mongoose"
import {Playlist} from "../models/playlist.model.js"
import {ApiError} from "../utils/ApiError.js"
import {ApiResponse} from "../utils/ApiResponse.js"
import {asyncHandler} from "../utils/asyncHandler.js"


const createPlaylist = asyncHandler(async (req, res) => {
    const {name, description} = req.body

    if(
        [name, description].some((field) => 
        field?.trim() === "" || field === undefined )
    ){
        throw new ApiError(400, "All fields are required")
    }

    const userId = req.user._id;
    name = name.toLowerCase();

    const existingPlaylist = await Playlist.findOne({
        $and: [{userId}, {name}]
    })
    if(existingPlaylist){
        throw new ApiError(409, "Playlist with same name already exist for the user");
    }

    const playlist = await Playlist.create({
        name : name,
        description: description,
        owner: userId
    });

    return res
        .status(200)
        .json(
            new ApiResponse(200, playlist, "Playlist created successfully")
        )
})

const getUserPlaylists = asyncHandler(async (req, res) => {
    const {userId} = req.params

    if(!userId?.trim()){
        throw new ApiError(400, "user Id is missing");
    }

    const playlist = await Playlist.aggregate([
        {
            $match: {
                owner: new mongoose.Types.ObjectId(req.user._id)
            }
        },
        {
            $lookup:{
                from: "user",
                localField: "_id",
                foreignField: "owner",
                as: "ownerDetails"  
            }
        },
        {
            $lookup:{
                from: "video",
                localField: "_id",
                foreignField: "video",
                as: "userVideos"  
            }
        },
        {
            $addFields: {
                totalVideos: {
                    $size: "$userVideos"
                }
            }
        },
        {
            $project: {
              name: 1,
              description: 1,
              createdAt: 1,
              updatedAt: 1,
              totalVideos: 1,
              ownerDetails: {
                username: 1,
                fullName: 1,
                avatar: 1,
              },
            },
        },
    ])
    if(!playlist){
        throw new ApiError(404, "No playlist found");
    }

    return res
    .status(200)
    .json(new ApiResponse(200, playlist, "Playlist found"))
})

const getPlaylistById = asyncHandler(async (req, res) => {
    const {playlistId} = req.params

    if(!playlistId?.trim()){
        throw new ApiError(400, "playlist Id is missing");
    }

    const playlist = await Playlist.findById(playlistId);
    if(!playlist){
        throw new ApiError(404, "No playlist found");
    }

    return res
    .status(200)
    .json(new ApiResponse(200, playlist, "Playlist found"))
})

const addVideoToPlaylist = asyncHandler(async (req, res) => {
    const {playlistId, videoId} = req.params

    if(
        [playlistId, videoId].some((field) => 
        field?.trim() === "" || field === undefined )
    ){
        throw new ApiError(400, "All fields are required")
    }

    const playlist = await Playlist.findById(playlistId);
    if (!playlist) {
        throw new ApiError(404, "Playlist not found");
    }

    const updatedPlaylist = await Playlist.findByIdAndUpdate(
        playlistId,
        {
            $push : {
                video : videoId
            }
        },
        { new: true }
    )

    return res
    .status(200)
    .json(new ApiResponse(200, playlist, "Video added successfully to playlist"))
})

const removeVideoFromPlaylist = asyncHandler(async (req, res) => {
    const {playlistId, videoId} = req.params
    if(
        [playlistId, videoId].some((field) => 
        field?.trim() === "" || field === undefined )
    ){
        throw new ApiError(400, "All fields are required")
    }

    const playlist = await Playlist.findById(playlistId);
    if (!playlist) {
        throw new ApiError(404, "Playlist not found");
    }

    const updatedPlaylist = await Playlist.findByIdAndUpdate(
        playlistId,
        {
            $pull : {
                video : videoId
            }
        },
        { new: true }
    )

    return res
    .status(200)
    .json(new ApiResponse(200, playlist, "Video removed successfully from playlist"))

})

const deletePlaylist = asyncHandler(async (req, res) => {
    const {playlistId} = req.params
    if(!playlistId){
        throw new ApiError(400, "Playlist Id is missing")
    }

    const playlist = await Playlist.findByIdAndDelete(playlistId);
    if(!playlist){
        throw new ApiError(404, "Playlist not found");
    }

    return res
    .status(200)
    .json(new ApiResponse(200, playlist, "playlist deleted successfully."))

    // TODO: delete playlist
})

const updatePlaylist = asyncHandler(async (req, res) => {
    const {playlistId} = req.params
    const {name, description} = req.body

    if(
        [playlistId, name, description].some((field) => 
        field?.trim() === "" || field === undefined )
    ){
        throw new ApiError(400, "All fields are required")
    }

    const playlist = await Playlist.findByIdAndUpdate(
        playlistId,
        {
            $set: {
                name: name,
                description: description
            }
        },
        {new: true}
    )

    if(playlist){
        throw new ApiError(404, "Playlist Id not found")
    }

    return res
    .status(200)
    .json(new ApiResponse(200, playlist, "Playlist Details Updated Successfully"))

    //TODO: update playlist
})

export {
    createPlaylist,
    getUserPlaylists,
    getPlaylistById,
    addVideoToPlaylist,
    removeVideoFromPlaylist,
    deletePlaylist,
    updatePlaylist
}